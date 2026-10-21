import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
  notFoundHeading,
  rowsOf,
} from './support/admin';
import { authenticate, clickInMuiPopover, expectHydrated } from './support/auth';
import {
  APPROVAL_SCENARIO_IDS as APPROVALS,
  APPROVAL_SCENARIO_TEXT as TEXT,
  USER_SCENARIO_IDS as USERS,
} from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports. Each string is
// asserted verbatim, so a reworded message fails here (rule 18).
const BRANCH_ACTIVATED = 'Branch activated';
const NO_APPROVAL_ACCESS =
  "Your role can't approve users or activate branches. Ask an administrator if you need access.";
const BRANCH_QUEUE_CONTEXT =
  'With Head Office selected, these branches can be listed but not activated. Switch to All branches to review them.';
const UNKNOWN_ID = '12000000-0000-4000-8000-0000000000ff';
const APPROVED_ACTIVE = 'Approved. Their membership is active.';
const APPROVED_PROVISIONING =
  'Approved. Identity provisioning is queued: the invitation is sent when it completes.';
const MEMBERSHIP_REVOKED = 'Membership revoked';
const PROVISIONING_NOTE =
  "Approval ran, and their sign-in identity is being created. The invitation is sent when it completes. If it stays here, identity provisioning may be switched off on the platform, and it can't be retried from here.";
const APPROVED_NOTE = 'Approved: this membership is active.';
const REJECTED_NOTE =
  "Rejected: this membership was revoked, and this email can't be invited to this institution again.";
const ACTIVATED_NOTE = 'Activated: this branch is live.';
const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';
const MAKER_CHECKER_BLOCKED = 'You drafted this branch, so another administrator must activate it.';
const ACCOUNT_SUSPENDED =
  "Their account is suspended on the platform, so this membership can't be approved.";
const APPROVE_FAILED =
  "The approval couldn't complete. They may still need an active role and, for staff and admin members, an active branch assignment. Refresh and check.";
const APPROVAL_CHANGED =
  'This approval changed since the page loaded. Refresh to see where it stands.';
const MEMBERSHIP_CHANGED =
  'This membership changed since the page loaded. Refresh to see its status.';
const VERIFIED_ON_APPROVAL = 'Verified by the platform on approval.';
const MAKER_NOT_PERMITTED = "Your role can't view the audit trail";
const ROLES_NOT_PERMITTED = "Your role can't view role assignments.";
const BRANCHES_NOT_PERMITTED = "Your role can't view branch assignments.";

/** The queue's first tab, through context selection, as the first navigation of a test. */
async function enterQueue(page: Page, branch: RegExp = ALL_BRANCHES) {
  await enterAdmin(page, '/admin/approvals/users', { heading: 'Approval queue', branch });
}

/** A request page once the context is selected. Bounded: the first hit of its tree compiles. */
async function openRequest(page: Page, path: string, name: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 15000 });
}

const userPath = (id: string) => `/admin/approvals/users/${id}`;
const branchPath = (id: string) => `/admin/approvals/branches/${id}`;

/** A click on a client control, once React owns it (a click on the SSR markup is dropped). */
async function press(locator: Locator) {
  await expectHydrated(locator);
  await locator.click();
}

/** The record hero: the innermost surface holding the page's h1, with its chips and decisions (as
 * users.spec.ts). A dialog's confirmation repeats a decision's name, so decisions are found here. */
const hero = (page: Page) =>
  page
    .locator('.MuiPaper-root')
    .filter({ has: page.getByRole('heading', { level: 1 }) })
    .last();
const decision = (page: Page, name: string) =>
  hero(page).getByRole('button', { name, exact: true });
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

/** A decision through its dialog; the caller asserts the outcome. */
async function decide(page: Page, label: string, reason?: string) {
  await press(decision(page, label));
  const dialog = dialogOf(page);
  if (reason !== undefined) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(reason);
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** The tenant bell, once its count streamed in (its own Suspense boundary). */
async function bell(page: Page, name: string) {
  const button = page.getByRole('banner').getByRole('button', { name, exact: true });
  await expect(button).toBeVisible({ timeout: 15000 });
  return button;
}

const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

/** The value of a description-list row in one region, found by its label. */
const fact = (scope: Locator, label: string) =>
  scope.locator('dt').filter({ hasText: label }).locator('xpath=following-sibling::dd[1]');

test.describe('approvals: the queue', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('opens the first tab from the rail, listing who waits newest first', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    const rail = page.getByRole('navigation', { name: 'Administration' });
    await expect(rail.getByRole('link', { name: 'Approval queue' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(rail.getByRole('link', { name: 'Approval queue' })).toHaveAttribute(
      'href',
      '/admin/approvals',
    );
    // Spec §10.6: the tab counts the actionable users (Daniel's approval already ran).
    await expect(
      page.getByRole('tab', { name: 'User onboarding (8)', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(rowsOf(page, 'Users')).toHaveCount(10); // header + 9
    const names = page.getByRole('table', { name: 'Users' }).locator('tbody').getByRole('link');
    await expect(names).toHaveText([
      'Usha Patel',
      TEXT.longName,
      'Tabitha Wekesa',
      'Samuel Kiptoo',
      'Rose Atieno',
      'Daniel Mutua',
      'Carol Wambui',
      'Brian Kiprono',
      'Amina Odhiambo',
    ]);
    // Approval already ran for Daniel: his row says so (Ruling 12). The copy appears twice in his
    // row (the onboarding state and the user status), so the count pins both, inside his row.
    const daniel = rowsOf(page, 'Users').filter({ hasText: 'Daniel Mutua' });
    const provisioning = daniel.getByText('Provisioning identity', { exact: true });
    await expect(provisioning).toHaveCount(2);
    await expect(provisioning.first()).toBeVisible();
    await expect(daniel).not.toContainText('Awaiting approval');

    // The rail opens /admin/approvals, which opens the first tab the holder can see.
    await page.goto('/admin/approvals');
    await expect(page).toHaveURL(/\/admin\/approvals\/users$/, { timeout: 15000 });
  });

  test('lists pending branches newest first, sorts them by name, and never lists a draft', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    await press(page.getByRole('tab', { name: 'Branch activation (3)', exact: true }));
    await expect(page).toHaveURL(/\/admin\/approvals\/branches$/, { timeout: 15000 });
    const table = page.getByRole('table', { name: 'Branches' });
    const names = table.locator('tbody').getByRole('link');
    await expect(rowsOf(page, 'Branches')).toHaveCount(4); // header + 3
    await expect(table).not.toContainText('Voi Branch');
    await expect(names).toHaveText([TEXT.longBranch, 'Naivasha Branch', 'Kericho Branch']);

    await table.getByRole('link', { name: 'Branch', exact: true }).click();
    // Read the params, never an order-dependent regex.
    await expect
      .poll(() => new URL(page.url()).searchParams.get('sortBy'), { timeout: 15000 })
      .toBe('branchName');
    expect(new URL(page.url()).searchParams.get('sortDir')).toBe('ASC');
    await expect(names).toHaveText(['Kericho Branch', TEXT.longBranch, 'Naivasha Branch']);
  });

  test('tells a branch context that activation needs All branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterAdmin(page, '/admin/approvals/branches', {
      heading: 'Approval queue',
      branch: /Head Office/,
    });

    await expect(page.getByRole('main').getByRole('note')).toContainText(BRANCH_QUEUE_CONTEXT);
    await expect(
      page.getByRole('button', { name: 'Switch to All branches', exact: true }),
    ).toBeVisible();
    await expect(rowsOf(page, 'Branches')).toHaveCount(4); // header + 3

    await page.goto(branchPath(APPROVALS.kericho));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Branch not available here' }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('hides the queue and the bell from a holder who can decide nothing', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'default');
    await enterAdmin(page, '/admin', { heading: 'Administration Overview' });

    await expect(
      page.getByRole('navigation', { name: 'Administration' }).getByRole('link', {
        name: 'Overview',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Administration' }).getByRole('link', {
        name: 'Approval queue',
      }),
    ).toHaveCount(0);
    // A full load streams the header's Suspense boundaries with the document, and the business
    // date chip (streamed beside the bell) has arrived, so no bell is no bell, not a late one.
    await page.goto('/admin');
    const banner = page.getByRole('banner');
    await expect(banner.getByRole('link', { name: /Business date · Open$/ })).toBeVisible({
      timeout: 15000,
    });
    await expect(banner.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);

    await page.goto('/admin/approvals');
    await expect(page.getByRole('heading', { level: 1, name: 'Approval queue' })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, NO_APPROVAL_ACCESS)).toBeVisible();
  });
});

test.describe('approvals: ids', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('answers a malformed or unknown id with not-found, and reads a mixed-case one', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    for (const path of [
      userPath('not-a-uuid'),
      branchPath('new'),
      userPath(UNKNOWN_ID),
      branchPath(UNKNOWN_ID),
    ]) {
      await page.goto(path);
      await expect(notFoundHeading(page)).toBeVisible({ timeout: 15000 });
    }
    await openRequest(page, userPath(APPROVALS.rose.toUpperCase()), 'Rose Atieno');
    await openRequest(page, branchPath(APPROVALS.kericho.toUpperCase()), 'Kericho Branch');
  });
});

test.describe('approvals: the notifications bell', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('counts what can be decided, and opens each queue', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);

    const button = await bell(page, 'Notifications: 11 approvals waiting');
    await expect(button).toContainText('11');
    await press(button);
    const dialog = page.getByRole('dialog', { name: 'Notifications' });
    await expect(dialog).toContainText('8 users are waiting for approval.');
    await expect(dialog).toContainText('3 branches are waiting for activation.');
    await expect(dialog).not.toContainText('Switch to All branches');
    await clickInMuiPopover(dialog.getByRole('link', { name: 'Review branch activation' }));
    await expect(page).toHaveURL(/\/admin\/approvals\/branches$/, { timeout: 15000 });

    await press(await bell(page, 'Notifications: 11 approvals waiting'));
    await clickInMuiPopover(
      page
        .getByRole('dialog', { name: 'Notifications' })
        .getByRole('link', { name: 'Review user onboarding' }),
    );
    await expect(page).toHaveURL(/\/admin\/approvals\/users$/, { timeout: 15000 });
  });

  test('counts one fewer after a decision', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, branchPath(APPROVALS.kericho), 'Kericho Branch');
    await bell(page, 'Notifications: 11 approvals waiting');

    await decide(page, 'Activate');
    await expect(toast(page, BRANCH_ACTIVATED)).toBeVisible();
    await bell(page, 'Notifications: 10 approvals waiting');
  });

  test('tells a branch context to switch to activate', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page, /Head Office/);

    await press(await bell(page, 'Notifications: 11 approvals waiting'));
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toContainText(
      '3 branches are waiting for activation. Switch to All branches to activate them.',
    );
  });

  // Ruling 1: the bell joins the header, and the user's name and email give way below `xl`. STOP
  // rule: if this fails, the header ruling is wrong, not the test. Its mutation proof is Task 9a
  // reverted (`lg` again): the organisation name then truncates at 1280 px.
  for (const width of [1200, 1280, 1440]) {
    test(`fits the header with the bell at ${width}px`, async ({ context, page }, testInfo) => {
      await page.setViewportSize({ width, height: 800 });
      await authenticate(context, testInfo, 'approvals');
      await enterQueue(page);

      const banner = page.getByRole('banner');
      const button = await bell(page, 'Notifications: 11 approvals waiting');
      const chip = banner.getByRole('link', { name: /Business date · Open$/ });
      const status = chip.getByText('Open', { exact: true });
      const organisation = banner.getByText('Greenfield SACCO', { exact: true });
      await expect(organisation).toBeVisible();
      await expect(status).toBeVisible();
      await expect(banner.getByRole('button', { name: /^BM Backend Jane Manager / })).toBeVisible();

      const [chipBox, statusBox, bellBox] = await Promise.all([
        chip.boundingBox(),
        status.boundingBox(),
        button.boundingBox(),
      ]);
      if (!chipBox || !statusBox || !bellBox) throw new Error('expected header boxes');
      // The status word is never clipped, and the bell never overlaps the chip.
      expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(chipBox.x + chipBox.width + 1);
      expect(bellBox.x >= chipBox.x + chipBox.width || bellBox.x + bellBox.width <= chipBox.x).toBe(
        true,
      );
      // Nothing in the app bar overflows it.
      expect(await banner.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      // Ruling 1's point: the institution you decide for stays whole with the bell in the bar. The
      // check is scoped to 1280 px (Ruling 1); at 1200 the name is whole too, and the checks above
      // cover that width.
      if (width >= 1280) {
        expect(
          await organisation.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
      }
    });
  }
});

test.describe('approvals: user onboarding decisions', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('approves a member whose identity must be created (202), focusing the title', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.zawadi), TEXT.longName);

    const dialog = await decide(page, 'Approve');
    await expect(toast(page, APPROVED_PROVISIONING)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(mainText(page, PROVISIONING_NOTE)).toBeVisible();
    await expect(decision(page, 'Approve')).toHaveCount(0);
    await expect(decision(page, 'Reject & revoke')).toHaveCount(0);
    await expect(region(page, 'Control checks')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: TEXT.longName })).toBeFocused();
  });

  test('approves an auditor with a sign-in identity (200)', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');

    await expect(
      fact(region(page, 'Control checks'), 'Has an active branch assignment'),
    ).toContainText('Not required');
    await decide(page, 'Approve');
    await expect(toast(page, APPROVED_ACTIVE)).toBeVisible();
    await expect(mainText(page, APPROVED_NOTE)).toBeVisible();
  });

  test('disables Approve for the signed-in user’s own invitation', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(USERS.carol), 'Carol Wambui');

    await expect(decision(page, 'Approve')).toBeDisabled();
    await expect(decision(page, 'Approve')).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    // The accessible description also resolves a hidden caption, so the caption's visibility is
    // asserted on its own (hero-scoped: the same sentence is a control check's detail).
    await expect(hero(page).getByText(USER_MAKER_CHECKER_BLOCKED, { exact: true })).toBeVisible();
    await expect(decision(page, 'Reject & revoke')).toBeEnabled();
    await expect(fact(region(page, 'Request'), 'Invited by')).toHaveText(
      'Backend Jane Manager (you)',
    );
    // A full holder sees the audit link inside the Request card (positive anchor for the gate).
    await expect(
      region(page, 'Request').getByRole('link', { name: 'Open the audit trail', exact: true }),
    ).toBeVisible();
    await expect(fact(region(page, 'Control checks'), 'Invited by someone else')).toContainText(
      'Not met',
    );
  });

  test('explains a missing prerequisite and returns focus to the confirmation', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.rose), 'Rose Atieno');

    await expect(fact(region(page, 'Control checks'), 'Has an active role')).toContainText(
      'Not met',
    );
    const dialog = await decide(page, 'Approve');
    await expect(dialog.getByRole('alert')).toContainText(APPROVE_FAILED);
    await expect(dialog.getByRole('alert')).toContainText('Reference:');
    await expect(dialog.getByRole('button', { name: 'Approve', exact: true })).toBeFocused();
  });

  test('rejects and revokes with a reason, the server checking it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.samuel), 'Samuel Kiptoo');

    await press(decision(page, 'Reject & revoke'));
    const dialog = page.getByRole('alertdialog', { name: 'Reject and revoke Samuel Kiptoo?' });
    await expect(dialog).toContainText('can never be invited to this institution again');
    // Three spaces pass the native minLength; the server trims and refuses them.
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('   ');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(dialog.getByText('Give a reason of at least 3 characters.')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: /^Reason/ })).toBeFocused();

    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Duplicate invitation');
    await dialog.getByRole('button', { name: 'Reject & revoke', exact: true }).click();
    await expect(toast(page, MEMBERSHIP_REVOKED)).toBeVisible();
    await expect(mainText(page, REJECTED_NOTE)).toBeVisible();
  });

  test('refuses a stale Reject & revoke after another tab approved (Ruling 5)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');
    const stale = await context.newPage();
    await openRequest(stale, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');

    await decide(page, 'Approve');
    await expect(toast(page, APPROVED_ACTIVE)).toBeVisible();

    const dialog = await decide(stale, 'Reject & revoke', 'Duplicate invitation');
    await expect(dialog.getByRole('alert')).toContainText(APPROVAL_CHANGED);
    await stale.reload();
    await expect(mainText(stale, APPROVED_NOTE)).toBeVisible({ timeout: 15000 });
  });

  test('refuses a stale Reject & revoke on the user record too (P-3)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    const stale = await context.newPage();
    await openRequest(stale, `/admin/users/${APPROVALS.tabitha}`, 'Tabitha Wekesa');
    await openRequest(page, userPath(APPROVALS.tabitha), 'Tabitha Wekesa');

    await decide(page, 'Approve');
    await expect(toast(page, APPROVED_ACTIVE)).toBeVisible();

    const dialog = await decide(stale, 'Reject & revoke', 'Duplicate invitation');
    await expect(dialog.getByRole('alert')).toContainText(MEMBERSHIP_CHANGED);
  });

  test('offers no decision while an identity is provisioning', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(USERS.daniel), 'Daniel Mutua');

    await expect(mainText(page, PROVISIONING_NOTE)).toBeVisible();
    await expect(decision(page, 'Approve')).toHaveCount(0);
    await expect(decision(page, 'Reject & revoke')).toHaveCount(0);
    await expect(region(page, 'Control checks')).toHaveCount(0);
  });

  test('disables Approve for a suspended account, keeping Reject & revoke', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.usha), 'Usha Patel');

    await expect(decision(page, 'Approve')).toBeDisabled();
    await expect(decision(page, 'Approve')).toHaveAccessibleDescription(ACCOUNT_SUSPENDED);
    await expect(hero(page).getByText(ACCOUNT_SUSPENDED, { exact: true })).toBeVisible();
    await expect(decision(page, 'Reject & revoke')).toBeEnabled();
  });

  test('leaves the checks to the platform when the audit trail and assignments can’t be read', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals-limited');
    await enterQueue(page);
    await openRequest(page, userPath(APPROVALS.zawadi), TEXT.longName);

    await expect(fact(region(page, 'Request'), 'Invited by')).toHaveText(MAKER_NOT_PERMITTED);
    // Scoped and exact: the same words also open two control checks' details.
    const access = region(page, 'Requested access');
    await expect(access.getByText(ROLES_NOT_PERMITTED, { exact: true })).toBeVisible();
    await expect(access.getByText(BRANCHES_NOT_PERMITTED, { exact: true })).toBeVisible();
    const checks = region(page, 'Control checks');
    for (const label of [
      'Invited by someone else',
      'Has an active role',
      'Has an active branch assignment',
    ]) {
      await expect(fact(checks, label)).toContainText('Checked on approval');
      await expect(fact(checks, label)).toContainText(VERIFIED_ON_APPROVAL);
    }
    await expect(decision(page, 'Approve')).toBeEnabled();
    await expect(decision(page, 'Reject & revoke')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Open the audit trail' })).toHaveCount(0);
  });
});

test.describe('approvals: branch activation decisions', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('activates a branch someone else drafted, focusing the title', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, branchPath(APPROVALS.kericho), 'Kericho Branch');

    await expect(fact(region(page, 'Request'), 'Drafted by')).toHaveText('Victor Otieno');
    await press(decision(page, 'Activate'));
    const dialog = page.getByRole('dialog', { name: 'Activate Kericho Branch?' });
    await dialog.getByRole('textbox', { name: 'Reason (optional)' }).fill('Licence received');
    await dialog.getByRole('button', { name: 'Activate', exact: true }).click();
    await expect(toast(page, BRANCH_ACTIVATED)).toBeVisible();
    await expect(mainText(page, ACTIVATED_NOTE)).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Kericho Branch' })).toBeFocused();
  });

  test('disables Activate for its drafter', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'approvals');
    await enterQueue(page);
    await openRequest(page, branchPath(APPROVALS.naivasha), 'Naivasha Branch');

    await expect(decision(page, 'Activate')).toBeDisabled();
    await expect(decision(page, 'Activate')).toHaveAccessibleDescription(MAKER_CHECKER_BLOCKED);
    await expect(hero(page).getByText(MAKER_CHECKER_BLOCKED, { exact: true })).toBeVisible();
  });
});

/** The accessibility matrix by surface (rule 13), so a failing scan hides nothing after it.
 * `regions`: each landmark name's expected count (axe rates landmark-unique moderate, so the
 * serious/critical scan can't see two landmarks sharing a name; rule 11). */
const SURFACES = [
  {
    label: 'user onboarding tab',
    path: '/admin/approvals/users',
    heading: 'Approval queue',
    regions: { 'User onboarding': 1, 'Users table': 1, Users: 0 },
  },
  {
    label: 'branch activation tab',
    path: '/admin/approvals/branches',
    heading: 'Approval queue',
    regions: { 'Branch activation': 1, 'Branches table': 1, Branches: 0 },
  },
  {
    label: 'user approval (100 characters, unbreakable email)',
    path: userPath(APPROVALS.zawadi),
    heading: TEXT.longName,
    regions: {
      Request: 1,
      Identity: 1,
      'Requested access': 1,
      'Role assignments': 1,
      'Branch assignments table': 1,
      'Control checks': 1,
    },
  },
  {
    label: 'user approval, Approve disabled',
    path: userPath(USERS.carol),
    heading: 'Carol Wambui',
    // Not an overlay: it proves the state the label names before the scan.
    open: async (page: Page) => {
      await expect(decision(page, 'Approve')).toBeDisabled();
      await expect(hero(page).getByText(USER_MAKER_CHECKER_BLOCKED, { exact: true })).toBeVisible();
    },
  },
  {
    // Not an overlay: it proves the state the label names (the outcome note, whose link must be
    // underlined: serious link-in-text-block) before the scan.
    label: 'user approval, provisioning (outcome note)',
    path: userPath(USERS.daniel),
    heading: 'Daniel Mutua',
    open: async (page: Page) => {
      await expect(mainText(page, PROVISIONING_NOTE)).toBeVisible();
    },
  },
  {
    label: 'reject and revoke dialog',
    path: userPath(USERS.carol),
    heading: 'Carol Wambui',
    open: async (page: Page) => {
      await press(decision(page, 'Reject & revoke'));
      await expect(
        page.getByRole('alertdialog', { name: 'Reject and revoke Carol Wambui?' }),
      ).toBeVisible();
      // Scan once the fade has finished: axe blends ancestor opacity into colour contrast.
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'failed approval',
    path: userPath(APPROVALS.rose),
    heading: 'Rose Atieno',
    open: async (page: Page) => {
      const dialog = await decide(page, 'Approve');
      await expect(dialog.getByRole('alert')).toContainText(APPROVE_FAILED);
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'branch approval (100 characters)',
    path: branchPath(APPROVALS.lamu),
    heading: TEXT.longBranch,
    regions: { Request: 1, Branch: 1, 'Control checks': 1 },
  },
  {
    label: 'branch approval, activated (outcome note)',
    path: branchPath(APPROVALS.kericho),
    heading: 'Kericho Branch',
    // Activated through the dialog, as the 11b test does, so the note and its link are on the page.
    open: async (page: Page) => {
      await decide(page, 'Activate', 'Licence received');
      await expect(mainText(page, ACTIVATED_NOTE)).toBeVisible();
      // Scan once the toast has grown in: axe blends ancestor opacity into colour contrast.
      await expect(toast(page, BRANCH_ACTIVATED)).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'notifications popover',
    path: '/admin/approvals/users',
    heading: 'Approval queue',
    open: async (page: Page) => {
      await press(await bell(page, 'Notifications: 11 approvals waiting'));
      await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
      await expect(page.locator('.MuiPopover-paper')).toHaveCSS('opacity', '1');
    },
  },
] as const;

// The describe's title is what the two --grep chunks select on ("approvals: accessibility .*\(light"
// and "…\(dark"): the grep text is the project, file, describe and test titles joined by spaces.
test.describe('approvals: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'approvals');
        await enterAdmin(page, surface.path, { heading: surface.heading, branch: ALL_BRANCHES });
        // The bell streams behind its own Suspense boundary: every scan and the 375 px page-width
        // check include the finished header.
        await bell(page, 'Notifications: 11 approvals waiting');
        if ('open' in surface) await surface.open(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
        if ('regions' in surface) {
          for (const [name, count] of Object.entries(surface.regions)) {
            await expect(page.getByRole('region', { name, exact: true })).toHaveCount(count);
          }
        }
      });
    }
  }
});
