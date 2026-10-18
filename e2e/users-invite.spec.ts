import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  enterAdmin,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
  mainText,
  statusChip,
} from './support/admin';
import { authenticate, clickMuiOption, expectHydrated, selectMuiOption } from './support/auth';
import { INVITE_SCENARIO_TEXT as TEXT, type ScenarioName } from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports. Each string is
// asserted verbatim, so a reworded message fails here.
const INVITE_FORBIDDEN =
  'Inviting someone needs permission to invite users and assign branches, and to view users, roles and branches. Ask an administrator if you need access.';
const ACTIVE_EMAIL = 'This email already belongs to a member of this institution.';
const REVOKED_EMAIL =
  "This email's membership here was revoked, so it can't be invited to this institution again.";
const NEEDS_A_BRANCH = 'Add a branch: staff and admin members need at least one.';
const ROLE_BRANCH_UNASSIGNED = 'Assign them to this branch under Branch assignments first.';
const INVITE_FAILED =
  "The platform couldn't create this invitation. The username may already belong to another account, here or in another institution, or a role or branch may have changed since this page loaded. Check them, then try again.";
const REVIEW_NOTE =
  'Sending creates the invitation now. A different administrator must approve it before they can use this institution. If this email already has a Finaxis account, that account is reused: its name, username and phone stay as they are.';
const USER_MAKER_CHECKER_BLOCKED =
  'You invited this user, so another administrator must approve them.';

const RECORD = /\/admin\/users\/[0-9a-f-]{36}$/;

/** A route's first hit compiles under a cold `next dev` (the "Compiling" indicator), which takes
 * tens of seconds. Used where a first hit can come in any order: each wizard visit and each
 * matrix surface's first visit, the email check's first answer with the Identity step that issues
 * it, and the record a send opens. Warm, these waits resolve in well under a second; the bound only
 * matters when they fail. */
const FIRST_HIT = 45000;

interface Identity {
  name: string;
  email: string;
  username: string;
}

const NEEMA: Identity = {
  name: 'Neema Wanjiku',
  email: 'neema.wanjiku@greenfield.example',
  username: 'neema.wanjiku',
};

/** enterAdmin's steps with FIRST_HIT bounds: a test's first visit to a page can be its
 * route's first hit under a cold `next dev`. */
async function enterFirstHit(page: Page, path: string, heading: string) {
  await page.goto(path);
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', ALL_BRANCHES);
  await expect(page).toHaveURL((url) => url.pathname === path, { timeout: FIRST_HIT });
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
    timeout: FIRST_HIT,
  });
}

/** The wizard as the first navigation of a test, once React owns its Continue. */
async function openWizard(page: Page) {
  await enterFirstHit(page, '/admin/users/new', 'Invite user');
  await expectHydrated(page.getByRole('button', { name: 'Continue' }));
}

/** A select inside `scope` (a row's group, or the page), once React owns it. The choice must take,
 * so a lost click fails at the select that lost it, not at the next control its open menu hides. */
async function choose(page: Page, scope: Page | Locator, label: string, option: string) {
  const combobox = scope.getByRole('combobox', { name: label, exact: true });
  await expectHydrated(combobox);
  await combobox.click();
  await clickMuiOption(page.getByRole('option', { name: option, exact: true }));
  await expect(combobox).toHaveText(option);
}

const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });

/** Continue, then wait for the next step's heading. Identity's Continue is a request (the email
 * check) and can be its route's first hit, so the caller passes FIRST_HIT there; the other steps
 * change in the browser and keep the 15 s bound. */
async function next(page: Page, step: string, timeout = 15000) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible({ timeout });
}

async function fillIdentity(page: Page, identity: Identity = NEEMA) {
  await page.getByRole('textbox', { name: 'Full name' }).fill(identity.name);
  await page.getByRole('textbox', { name: 'Email' }).fill(identity.email);
  await page.getByRole('textbox', { name: 'Username' }).fill(identity.username);
  await choose(page, page, 'Membership type', 'Staff');
}

/** Westlands as their home branch, and the Teller role everywhere. */
async function fillAccess(page: Page) {
  await choose(page, group(page, 'Branch assignment 1'), 'Branch', 'Westlands Branch (WESTLANDS)');
  await choose(page, group(page, 'Role 1'), 'Role', 'Teller (TELLER)');
}

async function sendInvitation(page: Page) {
  await page.getByRole('button', { name: 'Send invitation' }).click();
}

/** Whether the page is wider than its viewport, i.e. scrolls sideways. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** An element's box, in CSS pixels, for the gaps between controls. */
async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('The element is not rendered, so it has no box.');
  return box;
}

/** A select's label box: MUI names the select by its label's id, the first id in `aria-labelledby`. */
async function labelBox(page: Page, select: Locator) {
  const [labelId] = ((await select.getAttribute('aria-labelledby')) ?? '').split(' ');
  return boxOf(page.locator(`[id="${labelId}"]`));
}

/** A row's bottom rule: its border's width, its colour, and the row's own text colour beside it. */
const ruleOf = (row: Locator) =>
  row.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      width: style.borderBottomWidth,
      borderColor: style.borderBottomColor,
      color: style.color,
    };
  });

/** The shell's bell, once its count streamed in: its name carries the approvals waiting. */
const bell = (page: Page, count: number) =>
  page
    .getByRole('banner')
    .getByRole('button', { name: `Notifications: ${count} approvals waiting`, exact: true });

// 16's two keyboard helpers (`e2e/platform-tenants.spec.ts`), kept in the spec as 16 keeps them.

/** The focused control's room above the wizard's sticky action bar and below the sticky app bar. A
 * control closer than 0 is under a bar and, for keyboard users, hidden (WCAG 2.4.11). */
async function focusClearance(page: Page) {
  // A frame after the key press: the browser has scrolled the focused control into view.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  return page.evaluate(() => {
    const focused = document.activeElement;
    const actionBar = document.querySelector('form button[type="submit"]')?.parentElement;
    const form = actionBar?.closest('form');
    const appBar = document.querySelector('header');
    if (!focused || !actionBar || !form || !appBar) return null;
    const rect = focused.getBoundingClientRect();
    const labelled = focused as HTMLInputElement;
    return {
      name:
        focused.getAttribute('aria-label') ??
        labelled.labels?.[0]?.textContent ??
        focused.textContent.trim().slice(0, 40),
      inForm: form.contains(focused),
      inActionBar: actionBar.contains(focused),
      belowAppBar: rect.top - appBar.getBoundingClientRect().bottom,
      aboveActionBar: actionBar.getBoundingClientRect().top - rect.bottom,
    };
  });
}

/** Tabs from a step's heading to the action bar, then Shift+Tabs back out of the form: every stop
 * clears both sticky bars, and the walk covers at least `minimum` stops. */
async function expectFocusStopsClearTheBars(page: Page, step: string, minimum: number) {
  await page.getByRole('heading', { level: 2, name: step }).focus();
  let stops = 0;
  for (let press = 0; press < 25; press++) {
    await page.keyboard.press('Tab');
    const stop = await focusClearance(page);
    if (!stop?.inForm || stop.inActionBar) break;
    stops++;
    expect(
      stop.aboveActionBar,
      `Tab stop "${stop.name}" is under the action bar`,
    ).toBeGreaterThanOrEqual(0);
  }
  expect(stops).toBeGreaterThanOrEqual(minimum);

  // Backwards, out of the form: the shell's app bar must not cover a stop either.
  for (let press = 0; press < 40; press++) {
    await page.keyboard.press('Shift+Tab');
    const stop = await focusClearance(page);
    if (!stop?.inForm) break;
    if (stop.inActionBar) continue;
    expect(
      stop.belowAppBar,
      `Shift+Tab stop "${stop.name}" is under the app bar`,
    ).toBeGreaterThanOrEqual(0);
  }
}

test.describe('users invite: entry and identity', () => {
  // Each test signs in, selects a context and can be the first hit of a route tree under a cold
  // `next dev` compile (users.spec.ts uses the same budget).
  test.describe.configure({ timeout: 90000 });

  test('opens the wizard from the directory', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await enterAdmin(page, '/admin/users', { heading: 'Users & access', branch: ALL_BRANCHES });

    await page.getByRole('link', { name: 'Invite user' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Invite user' })).toBeVisible({
      timeout: FIRST_HIT,
    });
    await expect(page.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Invite user' }).getByRole('listitem')).toHaveCount(
      4,
    );
  });

  for (const scenario of [
    'users',
    'users-invite-limited',
  ] as const satisfies readonly ScenarioName[]) {
    test(`offers no invitation without every code it needs (${scenario})`, async ({
      context,
      page,
    }, testInfo) => {
      await authenticate(context, testInfo, scenario);
      await enterAdmin(page, '/admin/users', { heading: 'Users & access', branch: ALL_BRANCHES });
      await expect(page.getByRole('link', { name: 'Invite user' })).toHaveCount(0);

      await page.goto('/admin/users/new');
      await expect(mainText(page, INVITE_FORBIDDEN)).toBeVisible({ timeout: FIRST_HIT });
      await expect(page.getByRole('button', { name: 'Continue' })).toHaveCount(0);
    });
  }

  test('keeps an email already in use here on the Identity step, before anything is sent', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    const email = page.getByRole('textbox', { name: 'Email' });

    // Esther is an ACTIVE member.
    await fillIdentity(page, { ...NEEMA, email: 'esther.njoki@greenfield.example' });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(email).toHaveAccessibleDescription(ACTIVE_EMAIL, { timeout: FIRST_HIT });
    await expect(email).toBeFocused();
    await expect(mainText(page, 'Check these fields: Email.')).toBeVisible();

    // Hassan's membership was revoked: his email can never come back (BG-28). Letter case aside.
    await email.fill('Hassan.Ali@greenfield.example');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(email).toHaveAccessibleDescription(REVOKED_EMAIL, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 2, name: 'Identity' })).toBeVisible();

    await email.fill(NEEMA.email);
    await next(page, 'Access', FIRST_HIT);
  });
});

test.describe('users invite: sending', () => {
  test.describe.configure({ timeout: 90000 });

  test('refuses what the platform would answer with a 500, before sending (BG-07)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page);
    await next(page, 'Access', FIRST_HIT);

    // Only ACTIVE roles and branches are offered: no Loans officer (DISABLED), no Kisumu (pending).
    const roleRow = group(page, 'Role 1');
    await roleRow.getByRole('combobox', { name: 'Role', exact: true }).click();
    await expect(page.getByRole('option')).toHaveText([
      'Branch supervisor (SUPERVISOR)',
      'Teller (TELLER)',
      'Tenant admin (TENANT_ADMIN)',
    ]);
    await page.keyboard.press('Escape');
    const branchRow = group(page, 'Branch assignment 1');
    await branchRow.getByRole('combobox', { name: 'Branch', exact: true }).click();
    await expect(page.getByRole('option')).toHaveText([
      'Head Office (HEAD_OFFICE)',
      'Westlands Branch (WESTLANDS)',
    ]);
    await page.keyboard.press('Escape');

    // A staff member with no branch.
    await page.getByRole('button', { name: 'Remove branch assignment 1' }).click();
    await choose(page, roleRow, 'Role', 'Branch supervisor (SUPERVISOR)');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(mainText(page, NEEDS_A_BRANCH)).toBeVisible();

    // A branch-scoped role at a branch they aren't assigned to.
    await page.getByRole('button', { name: 'Add branch' }).click();
    const added = group(page, 'Branch assignment 1');
    await choose(page, added, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(page, roleRow, 'Scope', 'One branch');
    await choose(page, roleRow, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(page, added, 'Branch', 'Head Office (HEAD_OFFICE)');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      roleRow.getByRole('combobox', { name: 'Branch', exact: true }),
    ).toHaveAccessibleDescription(ROLE_BRANCH_UNASSIGNED);
    await expect(page.getByRole('heading', { level: 2, name: 'Access' })).toBeVisible();
  });

  test('invites a new staff member and opens their record, awaiting another administrator', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page);
    await next(page, 'Access', FIRST_HIT);
    await fillAccess(page);
    await page.getByRole('button', { name: 'Add role' }).click();
    const second = group(page, 'Role 2');
    await choose(page, second, 'Role', 'Branch supervisor (SUPERVISOR)');
    await choose(page, second, 'Scope', 'One branch');
    await choose(page, second, 'Branch', 'Westlands Branch (WESTLANDS)');
    await choose(page, page, 'Primary branch', 'Westlands Branch (WESTLANDS)');
    await next(page, 'Invitation');
    await expect(
      page.getByRole('checkbox', { name: 'Send the identity-provider invitation' }),
    ).toBeChecked();
    await next(page, 'Review');

    const access = page.getByRole('region', { name: 'Access', exact: true });
    await expect(access).toContainText('Westlands Branch (WESTLANDS) · Home');
    await expect(access).toContainText(
      'Branch supervisor (SUPERVISOR) · Westlands Branch (WESTLANDS)',
    );
    await expect(page.getByRole('note')).toHaveText(REVIEW_NOTE);
    // Amina, Brian and Carol await approval (Daniel's approval already ran, BG-11); Jane holds
    // user.approve and user.view but not branch.activate here, so Kisumu doesn't count.
    await expect(bell(page, 3)).toBeVisible({ timeout: 15000 });
    await sendInvitation(page);

    await expect(page).toHaveURL(RECORD, { timeout: FIRST_HIT });
    await expect(page.getByRole('heading', { level: 1, name: NEEMA.name })).toBeVisible();
    await expect(statusChip(page, 'Awaiting approval')).toBeVisible();
    // Jane invited her, so the platform would refuse Jane's approval (BG-02, BG-08).
    const approve = page.getByRole('button', { name: 'Approve', exact: true });
    await expect(approve).toBeDisabled();
    await expect(approve).toHaveAccessibleDescription(USER_MAKER_CHECKER_BLOCKED);
    // refresh() before the redirect (invite-actions.ts): the shell's bell sits in the layout the
    // redirect keeps, so it must count the new member without a reload.
    await expect(bell(page, 4)).toBeVisible({ timeout: 15000 });
  });

  test('keeps every answer after a refusal it can’t check, and sends again safely', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    // Otieno's username belongs to an account in another institution (a 500, BG-07).
    await fillIdentity(page, { ...NEEMA, username: TEXT.takenUsername });
    await next(page, 'Access', FIRST_HIT);
    await fillAccess(page);
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);

    await expect(mainText(page, INVITE_FAILED)).toBeVisible({ timeout: 15000 });
    await expect(mainText(page, /Reference: [0-9a-f-]{36}/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Access', exact: true })).toContainText(
      'Teller (TELLER) · Institution (all branches)',
    );

    await page.getByRole('button', { name: 'Edit identity' }).click();
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(NEEMA.email);
    await page.getByRole('textbox', { name: 'Username' }).fill(NEEMA.username);
    await next(page, 'Access', FIRST_HIT);
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);
    await expect(page).toHaveURL(RECORD, { timeout: FIRST_HIT });
    await expect(page.getByRole('heading', { level: 1, name: NEEMA.name })).toBeVisible();
  });

  test('reuses an account another institution has, keeping its own name', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page, { name: 'Rehema W.', email: TEXT.rehemaEmail, username: 'rehema.w' });
    await next(page, 'Access', FIRST_HIT);
    await fillAccess(page);
    await next(page, 'Invitation');
    await next(page, 'Review');
    await sendInvitation(page);

    await expect(page).toHaveURL(RECORD, { timeout: FIRST_HIT });
    await expect(page.getByRole('heading', { level: 1, name: TEXT.rehemaName })).toBeVisible();
  });

  // WCAG 2.4.11: the wizard's sticky action bar (and the shell's app bar, going backwards) must not
  // cover the control that has keyboard focus. axe can't see this; the Access step is the longest
  // form here, so it is walked with three rows of each. At 360 px the Review bar's buttons wrap to two
  // rows in every browser (the bar is 114 px tall), the layout CI saw at 375 px on the headless shell.
  for (const viewport of [
    { label: 'desktop', width: 1440, height: 900 },
    { label: '375px', width: 375, height: 812 },
    { label: '360px', width: 360, height: 740 },
  ]) {
    test(`keeps keyboard focus clear of the sticky bars on Access and Review (${viewport.label})`, async ({
      context,
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await authenticate(context, testInfo, 'users-invite');
      await openWizard(page);
      await fillIdentity(page);
      await next(page, 'Access', FIRST_HIT);
      for (const add of ['Add branch', 'Add branch', 'Add role', 'Add role']) {
        await page.getByRole('button', { name: add }).click();
      }

      // Three rows of each: their fields, their Remove buttons and the two Add buttons.
      await expectFocusStopsClearTheBars(page, 'Access', 10);

      for (const remove of [
        'Remove role 3',
        'Remove role 2',
        'Remove branch assignment 3',
        'Remove branch assignment 2',
      ]) {
        await page.getByRole('button', { name: remove }).click();
      }
      await fillAccess(page);
      await next(page, 'Invitation');
      await next(page, 'Review');

      // The three Edit buttons.
      await expectFocusStopsClearTheBars(page, 'Review', 3);
    });
  }

  // The Access rows at two widths. At 1280 px each role's Scope value shows whole beside its Role, and
  // a row has no rule; at 375 px each row's Remove sits about twice as far from the next row's first
  // label as two fields of one row sit apart, and the rule between the rows is not in the row's text
  // colour (both sections use the same layout).
  test('keeps the Access rows readable (1280 px, 375 px)', async ({ context, page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await authenticate(context, testInfo, 'users-invite');
    await openWizard(page);
    await fillIdentity(page);
    await next(page, 'Access', FIRST_HIT);
    for (const add of ['Add branch', 'Add branch', 'Add role', 'Add role']) {
      await page.getByRole('button', { name: add }).click();
    }
    await expect(group(page, 'Branch assignment 3')).toBeVisible();
    await expect(group(page, 'Role 3')).toBeVisible();

    for (let index = 1; index <= 3; index++) {
      const scope = group(page, `Role ${index}`).getByRole('combobox', {
        name: 'Scope',
        exact: true,
      });
      await expect(scope).toHaveText('Institution (all branches)');
      expect(
        await scope.evaluate((element) => element.scrollWidth <= element.clientWidth),
        `Role ${index}'s Scope value is cut`,
      ).toBe(true);
    }
    expect(await scrollsSideways(page)).toBe(false);
    // From sm a row has no rule: its bottom border is 0 wide.
    for (const row of ['Branch assignment 1', 'Role 1']) {
      expect((await ruleOf(group(page, row))).width, `${row} has a rule at 1280 px`).toBe('0px');
    }

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await scrollsSideways(page)).toBe(false);
    for (const section of [
      {
        row: 'Branch assignment',
        first: 'Branch',
        second: 'Assignment type',
        remove: 'Remove branch assignment',
      },
      { row: 'Role', first: 'Role', second: 'Scope', remove: 'Remove role' },
    ]) {
      const row1 = group(page, `${section.row} 1`);
      const row2 = group(page, `${section.row} 2`);
      // Row 1 is ruled off at 375 px, in a colour other than the row's text colour: a shorthand
      // border resets the colour to currentColor, which is how the rule once came out in the text.
      const rule = await ruleOf(row1);
      expect(rule.width, `${section.row} 1 has no rule at 375 px`).toBe('1px');
      expect(rule.borderColor, `${section.row} 1's rule is drawn in the text colour`).not.toBe(
        rule.color,
      );
      // Two fields of row 1: its first field's box to the second field's label.
      const firstField = await boxOf(
        row1.getByRole('combobox', { name: section.first, exact: true }),
      );
      const secondLabel = await labelBox(
        page,
        row1.getByRole('combobox', { name: section.second, exact: true }),
      );
      const fieldGap = secondLabel.y - (firstField.y + firstField.height);
      // Row 1's Remove: its box to row 2's first label.
      const remove = await boxOf(page.getByRole('button', { name: `${section.remove} 1` }));
      const nextLabel = await labelBox(
        page,
        row2.getByRole('combobox', { name: section.first, exact: true }),
      );
      const rowGap = nextLabel.y - (remove.y + remove.height);
      // The row's padding, the rule and the gap below it: a row's own gap, a rule and as much again.
      expect(rowGap, `${section.row} 1's Remove sits too close to row 2`).toBeGreaterThanOrEqual(
        2 * fieldGap,
      );
    }
  });
});

interface Surface {
  label: string;
  scenario: ScenarioName;
  path: string;
  heading: string;
  /** Brings the page to the state the scan covers. */
  open?: (page: Page) => Promise<void>;
}

const SURFACES: readonly Surface[] = [
  {
    label: 'the directory',
    scenario: 'users-invite',
    path: '/admin/users',
    heading: 'Users & access',
  },
  {
    label: 'identity with errors',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await expectHydrated(page.getByRole('button', { name: 'Continue' }));
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(mainText(page, /^Check these fields/)).toBeVisible();
    },
  },
  {
    label: 'access with errors',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page);
      await next(page, 'Access', FIRST_HIT);
      await choose(
        page,
        group(page, 'Branch assignment 1'),
        'Branch',
        'Westlands Branch (WESTLANDS)',
      );
      await choose(page, group(page, 'Role 1'), 'Scope', 'One branch');
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(mainText(page, 'Check these fields: Roles.')).toBeVisible();
    },
  },
  {
    label: 'invitation',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page);
      await next(page, 'Access', FIRST_HIT);
      await fillAccess(page);
      await next(page, 'Invitation');
    },
  },
  {
    label: 'review',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page);
      await next(page, 'Access', FIRST_HIT);
      await fillAccess(page);
      await next(page, 'Invitation');
      await next(page, 'Review');
    },
  },
  {
    label: 'identity with an email in use',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page, { ...NEEMA, email: 'esther.njoki@greenfield.example' });
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(mainText(page, ACTIVE_EMAIL)).toBeVisible({ timeout: FIRST_HIT });
    },
  },
  {
    label: 'review after a refused send',
    scenario: 'users-invite',
    path: '/admin/users/new',
    heading: 'Invite user',
    open: async (page) => {
      await fillIdentity(page, { ...NEEMA, username: TEXT.takenUsername });
      await next(page, 'Access', FIRST_HIT);
      await fillAccess(page);
      await next(page, 'Invitation');
      await next(page, 'Review');
      await sendInvitation(page);
      await expect(mainText(page, INVITE_FAILED)).toBeVisible({ timeout: 15000 });
    },
  },
  {
    label: 'the forbidden page',
    scenario: 'users-invite-limited',
    path: '/admin/users/new',
    heading: 'Invite user',
  },
];

// The describe's title is what the two --grep chunks select on ("users invite: accessibility .*\(light"
// and "…\(dark"): the grep text is the project, file, describe and test titles joined by spaces.
test.describe('users invite: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, surface.scenario);
        await enterFirstHit(page, surface.path, surface.heading);
        if (surface.open) await surface.open(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  }
});
