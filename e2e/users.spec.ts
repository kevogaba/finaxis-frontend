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
  type A11yCase,
} from './support/admin';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
import { IDS, USER_SCENARIO_IDS as USERS } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports, and an E2E only
// imports import-free modules. Each string is asserted verbatim, so a reworded message fails here.
const PROVISIONING_NOTE =
  "Approval ran, and their sign-in identity is being created. The invitation is sent when it completes. If it stays here, identity provisioning may be switched off on the platform, and it can't be retried from here.";
const NO_MEMBERSHIP_VIEW =
  "Membership actions need permission to view memberships, which your role doesn't include.";
const MEMBERSHIP_MISSING =
  "This user's membership couldn't be found, so its actions aren't available.";
const MEMBERSHIP_UNAVAILABLE =
  "This user's membership couldn't be loaded, so its actions aren't available. Refresh to try again.";
const OWN_MEMBERSHIP =
  "You can't suspend or revoke your own membership. Ask another administrator.";
const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';
const PARTIAL_SCAN_NOTE =
  "This list may be incomplete: the platform can't filter branch assignments by user, so only the first 500 branch assignments were checked.";
const NO_MEMBERSHIP_DETAILS = "You can't view membership details in your current role.";
const BRANCH_HINT = 'Assign them to a branch first to give a branch-scoped role.';
const PARTIAL_BRANCH_HINT =
  'Only the first 500 branch assignments were checked and none of theirs was among them, so only institution scope is offered here.';
const FORBIDDEN_TITLE = "You don't have permission";

/** The seeded home assignment of Felix at Westlands (`homeAt(7, …)` in scenarios.mts). */
const FELIX_HOME_ASSIGNMENT = '10000000-0000-4000-8000-000000000207';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A user id no scenario seeds (the seeds stop at …01b, …0301 and …0400 and above).
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

/** A record once the context is selected. Bounded: a record route can be the first hit of its tree
 * under a cold `next dev` compile. */
async function openUser(page: Page, id: string, name: string | RegExp) {
  await page.goto(`/admin/users/${id}`);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

const TAB_SEGMENTS = {
  'Roles & access': 'access',
  'Branch assignments': 'branches',
  Audit: 'audit',
} as const;

async function openTab(page: Page, label: keyof typeof TAB_SEGMENTS) {
  await page.getByRole('tab', { name: label }).click();
  await expect
    .poll(() => new URL(page.url()).pathname.split('/').pop(), { timeout: 15000 })
    .toBe(TAB_SEGMENTS[label]);
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
  // A users route can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 90000 });
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
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'mwangi', {
      timeout: 15000,
    });
    await expect(rowsOf(page, 'Users')).toHaveCount(3); // header + Joann + Ann
    await expect(
      rowsOf(page, 'Users').nth(1).getByRole('link', { name: 'Joann Mwangi', exact: true }),
    ).toBeVisible();
    await expect(
      rowsOf(page, 'Users').nth(2).getByRole('link', { name: 'Ann Mwangi', exact: true }),
    ).toBeVisible();

    // Wait for each cleared render: the next push builds on the rendered query.
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '13 users', { exact: true })).toBeVisible({ timeout: 15000 });
    await selectMuiOption(page, 'Membership', /^Pending approval$/);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('membershipStatus') === 'PENDING_APPROVAL',
      { timeout: 15000 },
    );
    await expect(rowsOf(page, 'Users')).toHaveCount(5); // header + Amina, Brian, Carol, Daniel
    // Daniel's User status cell reads `Provisioning identity` as well, so the cell is named: the
    // Onboarding column is the third.
    const daniel = rowsOf(page, 'Users').filter({ hasText: 'Daniel Mutua' });
    await expect(daniel.getByRole('cell').nth(2)).toHaveText('Provisioning identity');
    await expect(
      rowsOf(page, 'Users').filter({ hasText: 'Amina Odhiambo' }).getByRole('cell').nth(2),
    ).toHaveText('Awaiting approval');

    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(mainText(page, '13 users', { exact: true })).toBeVisible({ timeout: 15000 });
    await press(page.getByRole('button', { name: 'Go to next page' }));
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === '1', {
      timeout: 15000,
    });
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

    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Approval recorded')).toBeVisible();
    // The 202: the hero's onboarding chip moves on while the membership stays pending.
    await expect(hero(page).getByText('Provisioning identity', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      hero(page).getByText('Membership pending approval', { exact: true }),
    ).toBeVisible();
    await expect(hero(page).getByText('Awaiting approval', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    // Approve left, so focus lands on the first action that remains.
    await expect(page.getByRole('button', { name: 'Reject & revoke', exact: true })).toBeFocused();
    await expect(mainText(page, PROVISIONING_NOTE)).toBeVisible();
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

    await expect(await act(page, 'Approve')).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Approval recorded')).toBeVisible();
    await expect(hero(page).getByText('Membership active', { exact: true })).toBeVisible({
      timeout: 15000,
    });
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

    // Jane invited Carol (the `user.invite` audit event), so the platform would refuse her approval.
    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    await expect(mainText(page, USER_MAKER_CHECKER_BLOCKED)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject & revoke', exact: true })).toBeEnabled();
  });

  test('rejects and revokes a provisioning user permanently, checking the reason on the server', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.daniel, 'Daniel Mutua');

    // Approval already ran (the account is provisioning), so Approve is withheld.
    await expect(hero(page).getByText('Provisioning identity', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);

    await press(page.getByRole('button', { name: 'Reject & revoke', exact: true }));
    const dialog = page.getByRole('alertdialog', { name: 'Reject and revoke Daniel Mutua?' });
    await expect(dialog).toContainText('can never be invited to this institution again');
    await expectGuardFields(dialog);
    await expect(dialog.locator('input[name="membershipId"]')).toHaveValue(USERS.danielMembership);

    // Two spaces and one letter pass the browser's minLength, and the server trims them.
    const reason = dialog.getByRole('textbox', { name: /^Reason/ });
    await reason.fill('  a  ');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(dialog.getByText('Give a reason of at least 3 characters.')).toBeVisible({
      timeout: 15000,
    });
    await expect(reason).toHaveValue('  a  ');

    await reason.fill('Duplicate invitation');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Membership revoked')).toBeVisible();
    await expect(hero(page).getByText('Membership revoked', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(hero(page).getByText('Revoked', { exact: true })).toBeVisible();
    // Revoked is terminal: nothing is left to offer, so the title takes focus.
    await expect(hero(page).getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Daniel Mutua' })).toBeFocused();
  });

  test('suspends and reactivates a member, and audits both', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.esther, 'Esther Njoki');
    await expect(hero(page).getByText('Awaiting first sign-in', { exact: true })).toBeVisible();

    await expect(await act(page, 'Suspend', 'Cash audit')).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Membership suspended')).toBeVisible();
    await expect(hero(page).getByText('Membership suspended', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(hero(page).getByText('Suspended', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivate', exact: true })).toBeFocused();

    // Reactivate's reason is optional.
    await expect(await act(page, 'Reactivate')).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Membership reactivated')).toBeVisible();
    await expect(hero(page).getByText('Membership active', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(hero(page).getByText('Awaiting first sign-in', { exact: true })).toBeVisible();
    await expect(hero(page).getByText('Suspended', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Suspend', exact: true })).toBeFocused();

    // The default view is the user record, which the fake (like the platform, BG-16) keys both by.
    await openTab(page, 'Audit');
    const trail = page.getByRole('region', { name: 'Audit trail' });
    await expect(trail).toContainText('Suspended membership', { timeout: 15000 });
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
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2, { timeout: 15000 });
    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2, { timeout: 15000 });
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Profile' })).toBeVisible({
      timeout: 15000,
    });

    const dialog = await act(page, 'Revoke', 'Left the SACCO');
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(hero(page).getByText('Membership revoked', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(hero(page).getByText('Revoked', { exact: true })).toBeVisible();
    await expect(hero(page).getByRole('button')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Gladys Chebet' })).toBeFocused();

    // Every assignment went with it, and a revoked membership takes no new one.
    await openTab(page, 'Roles & access');
    await expect(mainText(page, 'No roles assigned', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, 'No branch assignments', { exact: true })).toBeVisible({
      timeout: 15000,
    });
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
    await expect(fact(page, 'Created (Africa/Nairobi)')).toHaveText('01 Jul 2026 · 11:00');
  });
});

test.describe('users: access and audit', () => {
  test.describe.configure({ timeout: 90000 });

  test('assigns and revokes roles, offering branch scope only where the user is assigned', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4, { timeout: 15000 }); // header + 3
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
    await page.getByRole('option', { name: 'Branch supervisor (SUPERVISOR)' }).click();
    await selectMuiOption(page, 'Scope', /^One branch$/);
    // Felix holds Westlands only, so it is the one branch on offer.
    await page.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Westlands Branch (WESTLANDS)');
    await page.getByRole('option', { name: 'Westlands Branch (WESTLANDS)' }).click();
    await drawer.getByRole('button', { name: 'Assign role' }).click();
    await expect(drawer).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Role assigned')).toBeVisible();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(5, { timeout: 15000 });

    await page
      .getByRole('button', {
        name: "Revoke Felix Omondi's Branch supervisor assignment (Westlands Branch)",
      })
      .click();
    const revoke = page.getByRole('alertdialog');
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect(revoke).toBeHidden({ timeout: 15000 });
    // The revoked row's button unmounts, so focus falls back to the record title.
    await expect(page.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeFocused();
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4, { timeout: 15000 });

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
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4, { timeout: 15000 });

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
    await expect(mainText(page, 'No roles assigned', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, 'This user holds no roles.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, 'No branch assignments', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Assign branch' })).toHaveCount(0);
  });

  test('hides Revoke for a branch role assignment at another branch, but not a tenant-wide one', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page, /Head Office/);
    await openRecord(page, 'Users', 'Felix Omondi');
    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4, { timeout: 15000 });

    // Contract §E.4: Felix holds Teller at Westlands, so a Head Office context would get a 404
    // revoking it. His institution-wide Teller and Loans officer rows can be revoked from anywhere.
    const westlands = rowsOf(page, 'Role assignments').filter({ hasText: 'Westlands Branch' });
    await expect(westlands).toHaveCount(1);
    await expect(westlands.getByRole('button')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /^Revoke Felix Omondi's .*\(Westlands Branch\)/ }),
    ).toHaveCount(0);
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

  test('assigns a branch and explains the last-assignment refusal', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterUser(page, USERS.felix, 'Felix Omondi');
    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2, { timeout: 15000 }); // Westlands
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Westlands Branch');
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Home');

    await press(page.getByRole('button', { name: 'Assign branch' }));
    const drawer = page.getByRole('dialog', { name: 'Assign to a branch' });
    await selectMuiOption(page, 'Branch', /^Head Office \(HEAD_OFFICE\)$/);
    await selectMuiOption(page, 'Assignment type', /^Operate$/);
    await drawer.getByRole('button', { name: 'Assign branch' }).click();
    await expect(drawer).toBeHidden({ timeout: 15000 });
    await expect(toast(page, 'Branch assigned')).toBeVisible();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(3, { timeout: 15000 });
    // Rows are ordered by branch name, so Head Office now precedes Westlands.
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Head Office');
    await expect(rowsOf(page, 'Branch assignments').nth(2)).toContainText('Westlands Branch');

    await page
      .getByRole('button', { name: "Revoke Felix Omondi's Operate assignment at Head Office" })
      .click();
    const revoke = page.getByRole('alertdialog');
    await revoke.getByRole('button', { name: 'Revoke' }).click();
    await expect(revoke).toBeHidden({ timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Felix Omondi' })).toBeFocused();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2, { timeout: 15000 });

    // A staff member's last assignment can't go (409), and the dialog names why.
    await page
      .getByRole('button', { name: "Revoke Felix Omondi's Home assignment at Westlands Branch" })
      .click();
    const last = page.getByRole('alertdialog');
    await last.getByRole('button', { name: 'Revoke' }).click();
    await expect(last.getByRole('alert')).toContainText(
      "may be the user's last branch assignment",
      {
        timeout: 15000,
      },
    );
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
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2, { timeout: 15000 });

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

  test('narrows a branch context to its branch', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page, /Westlands/);
    await openRecord(page, 'Users', 'Felix Omondi');

    await openTab(page, 'Branch assignments');
    // The scan is forced to Westlands (§E.4), and Jane can switch: the note offers it, inside it.
    const note = mainText(page, /^Only Westlands Branch is visible with a branch selected\./);
    await expect(note).toBeVisible({ timeout: 15000 });
    await expect(note.getByRole('button', { name: 'Switch to All branches' })).toBeVisible();
    await expect(mainText(page, PARTIAL_SCAN_NOTE)).toHaveCount(0);
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2);

    // His Westlands role assignment can be revoked from here.
    await openTab(page, 'Roles & access');
    await expect(
      page.getByRole('button', {
        name: "Revoke Felix Omondi's Teller assignment (Westlands Branch)",
      }),
    ).toBeVisible({ timeout: 15000 });

    // Esther holds Head Office only, so no branch is on offer for a branch-scoped role here.
    await openUser(page, USERS.esther, 'Esther Njoki');
    await openTab(page, 'Roles & access');
    await press(page.getByRole('button', { name: 'Assign role' }));
    const drawer = page.getByRole('dialog', { name: 'Assign a role' });
    await expect(drawer.getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      containing(
        "They aren't assigned to Westlands Branch. Assign them there first to give a branch-scoped role.",
      ),
    );
  });

  test('offers only the selected branch, and says nothing is partial when the scan was complete', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await openDirectory(page, /Head Office/);
    await openRecord(page, 'Users', 'Felix Omondi');
    await openTab(page, 'Branch assignments');

    // Felix holds Westlands only, so Head Office shows none of his rows, and the whole scan was
    // read: the context note stands alone.
    await expect(
      mainText(page, /^Only Head Office is visible with a branch selected\./),
    ).toBeVisible({ timeout: 15000 });
    await expect(mainText(page, PARTIAL_SCAN_NOTE)).toHaveCount(0);
    // "No branch assignments" would be a false fact under that note: only this branch was visible.
    await expect(mainText(page, 'No assignment at Head Office', { exact: true })).toBeVisible();
    await expect(
      mainText(
        page,
        'They may be assigned to other branches. Switch to All branches to see them. Assign a branch so they can work there.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(mainText(page, 'No branch assignments', { exact: true })).toHaveCount(0);

    await press(page.getByRole('button', { name: 'Assign branch' }));
    const drawer = page.getByRole('dialog', { name: 'Assign to a branch' });
    // Only the selected branch is reachable, already chosen, and labelled with its code.
    await expect(drawer.getByRole('combobox', { name: 'Branch' })).toHaveText(
      'Head Office (HEAD_OFFICE)',
    );
    await drawer.getByRole('combobox', { name: 'Branch' }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option')).toHaveText('Head Office (HEAD_OFFICE)');
  });

  test("says the branch is the only one visible when the signed-in user can't switch", async ({
    context,
    page,
  }, testInfo) => {
    // Westlands is suspended here, so Jane has one active branch: selection pins Head Office and
    // All branches isn't available to her.
    await authenticate(context, testInfo, 'suspended-branch');
    await enterAdmin(page, `/admin/users/${IDS.jane}/branches`, {
      heading: 'Backend Jane Manager',
      branch: null,
    });

    await expect(
      mainText(
        page,
        "Only Head Office is visible: your account is assigned to this branch only, so this user's other branch assignments can't be shown.",
      ),
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Switch to All branches' })).toHaveCount(0);
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2); // Head Office
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
    await expect(events).toHaveCount(2, { timeout: 15000 });
    await expect(events.nth(1)).toContainText('Invited user');

    await press(views.getByRole('button', { name: 'Account' }));
    await expect.poll(() => searchParam(page, 'view'), { timeout: 15000 }).toBe('account');
    await expect(events.nth(1)).toContainText('Activated on first sign-in', { timeout: 15000 });
    await expect(events).toHaveCount(2);
    await expect(views.getByRole('button', { name: 'Account' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await views.getByRole('button', { name: 'Membership' }).click();
    await expect.poll(() => searchParam(page, 'view'), { timeout: 15000 }).toBe('membership');
    await expect(events.nth(1)).toContainText('Activated membership', { timeout: 15000 });
    await expect(events).toHaveCount(2);

    // Felix performed the account activation himself.
    await views.getByRole('button', { name: 'Performed by' }).click();
    await expect.poll(() => searchParam(page, 'view'), { timeout: 15000 }).toBe('actor');
    await expect(events.nth(1)).toContainText('Activated on first sign-in', { timeout: 15000 });
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
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === null, {
      timeout: 15000,
    });
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4, { timeout: 15000 });

    await page.goto(`/admin/users/${USERS.felix}/branches?page=7&size=10`);
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === null, {
      timeout: 15000,
    });
    expect(searchParam(page, 'size')).toBe('10');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2, { timeout: 15000 });

    await page.goto(`/admin/users/${USERS.felix}/audit?view=account&page=9&size=10`);
    await expect(page).toHaveURL((url) => url.searchParams.get('page') === null, {
      timeout: 15000,
    });
    expect(searchParam(page, 'view')).toBe('account');
    expect(searchParam(page, 'size')).toBe('10');
    await expect(rowsOf(page, 'Audit events').nth(1)).toContainText('Activated on first sign-in', {
      timeout: 15000,
    });
  });

  test('filters the audit trail by an actor picked from the user search', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users');
    await enterAdmin(page, '/admin/audit', { heading: 'Audit trail', branch: ALL_BRANCHES });
    // The picker keeps the filters already set: an Entity type of User.
    await page.goto('/admin/audit?entityType=USER');
    await expect(page.getByRole('heading', { level: 1, name: 'Audit trail' })).toBeVisible({
      timeout: 15000,
    });

    const actor = page.getByRole('combobox', { name: 'Actor' });
    await expectHydrated(actor);
    await actor.fill('Victor');
    await page.getByRole('option', { name: /Victor Otieno/ }).click();

    await expect(page).toHaveURL((url) => url.searchParams.get('actorId') === USERS.victor, {
      timeout: 15000,
    });
    expect(searchParam(page, 'entityType')).toBe('USER');
    expect(searchParam(page, 'page')).toBeNull();
    const chip = page.getByRole('button', { name: 'Actor: Victor Otieno' });
    await expect(chip).toBeVisible();
    // His four invitations; the sixth USER event, Jane's, is another actor's.
    await expect(page.getByRole('status').filter({ hasText: /^4 events$/ })).toBeVisible();
    // The search starts over, empty, and keeps the keyboard where the user was.
    await expect(actor).toHaveValue('');
    await expect(actor).toBeFocused();

    // Removing the chip drops the filter and keeps focus on the page (the toolbar's own rule).
    await chip.click();
    await expect(page).toHaveURL((url) => url.searchParams.get('actorId') === null, {
      timeout: 15000,
    });
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
    await expect(page.getByRole('status').filter({ hasText: /^37 events$/ })).toBeVisible({
      timeout: 15000,
    });
    expect(searchParam(page, 'page')).toBe('1');

    const actor = page.getByRole('combobox', { name: 'Actor' });
    await expectHydrated(actor);
    await actor.fill('Jane');
    await page.getByRole('option', { name: /Backend Jane Manager/ }).click();

    await expect(page).toHaveURL((url) => url.searchParams.get('actorId') === IDS.jane, {
      timeout: 15000,
    });
    expect(searchParam(page, 'page')).toBeNull();
    expect(searchParam(page, 'size')).toBe('10');
    // Jane did 27 things: 3 pages, and the first one is shown.
    await expect(page.getByRole('status').filter({ hasText: /^27 events$/ })).toBeVisible();
    await expect(rowsOf(page, 'Audit events')).toHaveCount(11); // header + 10
  });
});

test.describe('users: gating and ids', () => {
  test.describe.configure({ timeout: 90000 });

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
    await expect(mainText(page, FORBIDDEN_TITLE, { exact: true })).toBeVisible({ timeout: 15000 });
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
    for (const note of [NO_MEMBERSHIP_VIEW, MEMBERSHIP_MISSING, MEMBERSHIP_UNAVAILABLE]) {
      await expect(mainText(page, note)).toHaveCount(0);
    }

    await openTab(page, 'Roles & access');
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(2, { timeout: 15000 });
    await expect(rowsOf(page, 'Role assignments').nth(1)).toContainText('Teller');
    await expect(page.getByRole('button', { name: 'Assign role' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
    // With nothing focusable inside, the scrollable table is still reachable by keyboard.
    await expect(page.locator('[role="region"][aria-label="Role assignments"]')).toHaveAttribute(
      'tabindex',
      '0',
    );

    await openTab(page, 'Branch assignments');
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2, { timeout: 15000 });
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Westlands Branch');
    await expect(page.getByRole('button', { name: 'Assign branch' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Revoke/ })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Actions' })).toHaveCount(0);
    // The section card is a region of the same name, so the table's own is picked by its label.
    await expect(page.locator('[role="region"][aria-label="Branch assignments"]')).toHaveAttribute(
      'tabindex',
      '0',
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
      await expect(notFoundHeading(page), path).toBeVisible({ timeout: 15000 });
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
    await expect(rowsOf(page, 'Role assignments')).toHaveCount(4, { timeout: 15000 });

    await page.goto(`/admin/users/${upper}/audit`);
    await expect(rowsOf(page, 'Audit events').nth(1)).toContainText('Invited user', {
      timeout: 15000,
    });
    // A row's link into the full trail carries the lower-case id too.
    const link = page.getByRole('link', { name: /view event/i }).first();
    const href = new URL((await link.getAttribute('href')) ?? '', 'http://localhost');
    expect(href.pathname).toBe('/admin/audit');
    expect(href.searchParams.get('entityId')).toBe(USERS.felix);
    expect(href.searchParams.get('entityType')).toBe('USER');
  });

  test('marks a scan that hit its ceiling as partial', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users-many-assignments');
    await enterUser(page, USERS.felix, 'Felix Omondi');

    // 511 active assignments, 500 of them read: Felix's row is in the window, but the list is
    // flagged, never presented as the whole.
    await expect(fact(page, 'Branch assignments')).toHaveText('At least 1 (partial)', {
      timeout: 15000,
    });
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, PARTIAL_SCAN_NOTE)).toBeVisible({ timeout: 15000 });
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2); // Westlands
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Westlands Branch');
    // No branch is selected, so there is no context note and nothing to switch.
    await expect(mainText(page, /is visible with a branch selected/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Switch to All branches' })).toHaveCount(0);

    // Ann holds nothing of her own in the window: partial, not "no assignments", and the role
    // drawer's hint says the scan was partial instead of claiming she has no branch.
    await openUser(page, USERS.ann, 'Ann Mwangi');
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, PARTIAL_SCAN_NOTE)).toBeVisible({ timeout: 15000 });
    await expect(mainText(page, 'No branch assignments found', { exact: true })).toBeVisible();
    await expect(
      mainText(
        page,
        'Only the first 500 branch assignments were checked, so they may be assigned beyond them. Assign a branch so they can work there.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(mainText(page, 'No branch assignments', { exact: true })).toHaveCount(0);
    await openTab(page, 'Roles & access');
    await press(page.getByRole('button', { name: 'Assign role' }));
    const drawer = page.getByRole('dialog', { name: 'Assign a role' });
    await expect(drawer.getByRole('combobox', { name: 'Scope' })).toHaveAccessibleDescription(
      containing(PARTIAL_BRANCH_HINT),
    );
    await drawer.getByRole('combobox', { name: 'Scope' }).click();
    await expect(page.getByRole('option', { name: 'One branch' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('says both notes, the branch first, when a branch context hit the ceiling', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-many-assignments');
    // Head Office holds 506 of the 511 active assignments (500 fillers and six people): the scan
    // forced to it reads 500 and stops.
    await openDirectory(page, /Head Office/);
    await openRecord(page, 'Users', 'Joann Mwangi');

    // Joann's own Head Office row is in the window: a floor, not a count.
    await expect(fact(page, 'Branch assignments')).toHaveText(
      'At least 1 at Head Office (partial)',
      {
        timeout: 15000,
      },
    );
    await openTab(page, 'Branch assignments');
    const notes = mainText(
      page,
      /^(Only Head Office is visible with a branch selected\.|This list may be incomplete)/,
    );
    await expect(notes).toHaveText([
      /^Only Head Office is visible with a branch selected\. Switch to All branches to see this user's other branch assignments\./,
      PARTIAL_SCAN_NOTE,
    ]);
    await expect(
      mainText(page, /^Only Head Office is visible/).getByRole('button', {
        name: 'Switch to All branches',
      }),
    ).toBeVisible();
    await expect(rowsOf(page, 'Branch assignments')).toHaveCount(2); // Joann's Head Office row
    await expect(rowsOf(page, 'Branch assignments').nth(1)).toContainText('Head Office');

    // Felix holds none at Head Office: never a bare "0 at Head Office", and not "At least 0" either.
    await openUser(page, USERS.felix, 'Felix Omondi');
    await expect(fact(page, 'Branch assignments')).toHaveText(
      'None found at Head Office (partial)',
      {
        timeout: 15000,
      },
    );
    // The tab doesn't claim "No assignment at Head Office" for a branch whose list was capped.
    await openTab(page, 'Branch assignments');
    await expect(mainText(page, 'No branch assignments found', { exact: true })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, /^No assignment at /)).toHaveCount(0);
  });
});

test.describe('users: accessibility', () => {
  // Each case scans eight surfaces after /select-context.
  test.describe.configure({ timeout: 180000 });

  for (const a11yCase of A11Y_CASES) {
    test(`has no serious or critical accessibility violations (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
      context,
      page,
    }, testInfo) => {
      const scan = async (path: string, heading: string | RegExp) => {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
          timeout: 15000,
        });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      };

      await applyA11yCase(page, a11yCase);
      await authenticate(context, testInfo, 'users');
      await openDirectory(page);
      await expect(rowsOf(page, 'Users')).toHaveCount(11);
      await expectA11yCaseApplied(page, a11yCase);
      await expectNoSeriousOrCriticalViolations(page);

      // The 100-character name and a long, nested email: hero, tabs and Overview never scroll the
      // page (index item 4).
      await scan(`/admin/users/${USERS.wanjiru}`, WANJIRU);

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
      await expect(page.getByRole('option').first()).toBeVisible({ timeout: 15000 });
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
        await expect(rowsOf(page, table)).toHaveCount(2, { timeout: 15000 });
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      }
    });
  }
});
