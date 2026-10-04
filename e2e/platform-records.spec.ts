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
} from './support/admin';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
import { IDS, RECORD_SCENARIO_IDS as R, TENANT_SCENARIO_IDS as T } from './fake-api/scenarios.mts';

const ACME = `/platform-admin/tenants/${IDS.acme}`;
const LONG_ACCOUNT_NAME =
  'Nyokabi Wairimu Kamau-Achieng Muthoni Njeri Chebet Jepkoech Nyambura Akinyi Atieno Wanjiku Mwangi Ay';
const LONG_BRANCH_NAME =
  'Likoni Ferry Crossing and Mombasa Old Town Customer Service Centre for the Teachers and Allied Staff';

/** A platform page through context selection (the operator's one branch is picked by itself). */
const enterPlatform = (page: Page, pathname: string, heading: string | RegExp) =>
  enterAdmin(page, pathname, { heading, organisation: /Platform/, branch: null });

// Deactivate is an alertdialog (irreversible); Suspend, Reactivate and Approve are dialogs.
const dialogOf = (page: Page) => page.getByRole('alertdialog').or(page.getByRole('dialog'));

/** A hero account action through its dialog; the caller asserts the outcome. */
async function act(page: Page, label: string, fill: { reason?: string; username?: string } = {}) {
  const trigger = page.getByRole('button', { name: label, exact: true });
  // A click on the server-rendered button before React claims it opens nothing.
  await expectHydrated(trigger);
  await trigger.click();
  const dialog = dialogOf(page);
  if (fill.reason) await dialog.getByRole('textbox', { name: /^Reason/ }).fill(fill.reason);
  if (fill.username !== undefined) {
    await dialog.getByRole('textbox', { name: /to confirm$/ }).fill(fill.username);
  }
  await dialog.getByRole('button', { name: label, exact: true }).click();
  return dialog;
}

/** A toast: MUI alerts in the toast region. "Account suspended" is also the hero chip's text, so
 * a plain getByText would match twice. */
const toast = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

const width = async (locator: Locator) => (await locator.boundingBox())?.width ?? 0;

const param = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

/** A query parameter of the current URL, once the navigation that sets it has landed. Reads
 * `searchParams`, so the order of the parameters never matters. */
const expectParam = (page: Page, name: string, value: string) =>
  expect.poll(() => param(page, name), { message: `the "${name}" query parameter` }).toBe(value);

test.describe('platform records: institution branches', () => {
  // Every route here can be the first hit of its tree under a cold `next dev` compile.
  test.describe.configure({ timeout: 60000 });
  // The platform shows UTC, whatever the viewer's zone (Ruling 13): a browser in Nairobi (UTC+3)
  // would read 11:00 for a seed's 08:00Z if any time were rendered in its own zone.
  test.use({ timezoneId: 'Africa/Nairobi' });

  test("lists an institution's branches newest first, cuts a long name inside the card, then filters and sorts them in the URL", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, `${ACME}/branches`, 'Acme SACCO');

    // Header + five branches, newest first: Likoni (20 Aug) leads.
    await expect(rowsOf(page, 'Branches')).toHaveCount(6);
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText(LONG_BRANCH_NAME);
    await expect(mainText(page, '5 branches', { exact: true })).toBeVisible();

    // The name cap (rule 12; e2e/users.spec.ts's check): the 100-character name stops at
    // min(320px, 60vw), inside a 375 px card.
    const name = rowsOf(page, 'Branches').nth(1).getByRole('link', { name: LONG_BRANCH_NAME });
    await page.setViewportSize({ width: 1440, height: 900 });
    // Positive control: a wide screen shows the full 320 px, so the cap below is the narrow one.
    expect(await width(name)).toBeGreaterThan(300);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(() => width(name)).toBeLessThanOrEqual(0.6 * 375 + 1);
    await expect(name).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 800 });
    await selectMuiOption(page, 'Status', /^Suspended$/);
    await expectParam(page, 'status', 'SUSPENDED');
    await expect(rowsOf(page, 'Branches')).toHaveCount(2);
    await expect(rowsOf(page, 'Branches').nth(1)).toContainText('Nakuru Branch');

    await page
      .getByRole('table', { name: 'Branches' })
      .getByRole('link', { name: 'Code', exact: true })
      .click();
    await expectParam(page, 'sortBy', 'branchCode');
    await expectParam(page, 'sortDir', 'ASC');
    // The filter survives the sort.
    expect(param(page, 'status')).toBe('SUSPENDED');
  });

  test('opens a branch read-only, in UTC, and follows its parent', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, `${ACME}/branches`, 'Acme SACCO');

    await openRecord(page, 'Branches', 'Nakuru Branch');
    await expect(mainText(page, 'NAKURU · Acme SACCO')).toBeVisible();
    // Seeded 08:00Z and 09:30Z, read from a browser in UTC+3: UTC, not 11:00 and 12:30.
    await expect(mainText(page, '20 Jul 2026 · 08:00')).toBeVisible();
    await expect(mainText(page, '01 Aug 2026 · 09:30')).toBeVisible();
    await expect(mainText(page, 'Premises under renovation')).toBeVisible();
    await expect(statusChip(page, 'Suspended')).toBeVisible();
    // Read-only: the one button is "Copy Branch ID" (the platform has no branch lifecycle, BG-13).
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
    await expect(
      page.getByRole('main').getByRole('button', { name: 'Copy Branch ID' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Back to branches' }).click();
    await openRecord(page, 'Branches', 'Mombasa Road Branch');
    await page.getByRole('main').getByRole('link', { name: 'Head Office', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Head Office' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveURL((url) => url.pathname.endsWith(`/branches/${R.acmeHeadOffice}`), {
      timeout: 15000,
    });
  });

  test("creates a branch draft where you're a member, and opens it", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, `${ACME}/branches`, 'Acme SACCO');

    await page.getByRole('link', { name: 'Create branch draft' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Create branch draft' })).toBeVisible({
      timeout: 15000,
    });
    await expect(
      mainText(
        page,
        "You can create a branch here only if you're also an active member of Acme SACCO",
      ),
    ).toBeVisible();

    await expect(
      mainText(
        page,
        'The draft is created in Acme SACCO. Its own administrators then submit it and activate it.',
      ),
    ).toBeVisible();

    await page.getByRole('textbox', { name: 'Branch code' }).fill('THIKA');
    await page.getByRole('textbox', { name: 'Branch name' }).fill('Thika Road Branch');
    const create = page.getByRole('button', { name: 'Create draft' });
    // The form submits through React; a click on the server-rendered button would submit natively.
    await expectHydrated(create);
    await create.click();

    await expect(page.getByRole('heading', { level: 1, name: 'Thika Road Branch' })).toBeVisible({
      timeout: 15000,
    });
    await expect(statusChip(page, 'Draft')).toBeVisible();
    // The platform can't move a draft on: only the copy-id button is offered, no lifecycle action.
    await expect(page.getByRole('main').getByRole('button')).toHaveCount(1);
    await expect(page).toHaveURL((url) => /\/branches\/[0-9a-f-]{36}$/.test(url.pathname));
  });

  test("explains the platform's refusal where you aren't a member", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(
      page,
      `/platform-admin/tenants/${T.pwani}/branches/new`,
      'Create branch draft',
    );

    const code = page.getByRole('textbox', { name: 'Branch code' });
    await code.fill('THIKA');
    await page.getByRole('textbox', { name: 'Branch name' }).fill('Thika Road Branch');
    const create = page.getByRole('button', { name: 'Create draft' });
    await expectHydrated(create);
    await create.click();

    await expect(
      mainText(page, /You must also be an active member of this institution/),
    ).toBeVisible();
    // The refusal keeps what was typed.
    await expect(code).toHaveValue('THIKA');
    await expect(page.getByRole('textbox', { name: 'Branch name' })).toHaveValue(
      'Thika Road Branch',
    );
  });

  test("offers no branch draft for an institution that isn't active", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    const kilimo = `/platform-admin/tenants/${T.kilimo}`;
    await enterPlatform(page, `${kilimo}/branches`, 'Kilimo Bora SACCO');

    // The tab has settled (Kilimo, suspended, has no branches), so the absence below is real.
    await expect(mainText(page, 'This institution has no branches yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create branch draft' })).toHaveCount(0);

    await page.goto(`${kilimo}/branches/new`);
    await expect(page.getByRole('heading', { level: 1, name: 'Create branch draft' })).toBeVisible({
      timeout: 15000,
    });
    await expect(mainText(page, 'Only an active institution can take new branches')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Branch code' })).toHaveCount(0);
  });
});

test.describe('platform records: users and accounts', () => {
  test.describe.configure({ timeout: 60000 });

  test("lists an institution's users and filters them in the URL", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, `${ACME}/users`, 'Acme SACCO');

    // Header + eight members of Acme (Jane, Achieng, Baraka, Chebet, Daudi, Esi, Faraji, Nyokabi).
    await expect(rowsOf(page, 'Users')).toHaveCount(9);
    await expect(mainText(page, '8 users', { exact: true })).toBeVisible();

    await selectMuiOption(page, 'User status', /^Suspended$/);
    await expectParam(page, 'userStatus', 'SUSPENDED');
    await expect(rowsOf(page, 'Users')).toHaveCount(2);
    await expect(rowsOf(page, 'Users').nth(1)).toContainText('Baraka Mwita');
  });

  test('suspends an account in every institution, then reactivates it', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, `${ACME}/users`, 'Acme SACCO');

    await openRecord(page, 'Users', 'Esi Mensah');
    await expect(
      mainText(
        page,
        "Account actions apply to this person's sign-in account on the whole platform",
      ),
    ).toBeVisible();

    await act(page, 'Suspend account', { reason: 'Fraud review' });
    await expect(toast(page, 'Account suspended')).toBeVisible();
    await expect(statusChip(page, 'Account suspended')).toBeVisible();

    // The account is global: Esi's membership at Pwani shows the same suspension.
    await page.goto(`/platform-admin/tenants/${T.pwani}/users/${R.esi}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeVisible({
      timeout: 15000,
    });
    await expect(statusChip(page, 'Account suspended')).toBeVisible();

    await act(page, 'Reactivate account');
    await expect(toast(page, 'Account reactivated')).toBeVisible();
    await expect(statusChip(page, 'Account active')).toBeVisible();
  });

  test('deactivates an account only with its username typed back', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, `${ACME}/users/${R.achieng}`, 'Achieng Odera');

    const dialog = await act(page, 'Deactivate account', {
      reason: 'Left the institution',
      username: 'achieng',
    });
    // "achieng" isn't the username ("achieng.odera"): refused, and the dialog stays open.
    await expect(dialog.getByText('Type the username exactly as shown.')).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('textbox', { name: /to confirm$/ }).fill('achieng.odera');
    await dialog.getByRole('button', { name: 'Deactivate account', exact: true }).click();

    await expect(toast(page, 'Account deactivated')).toBeVisible();
    await expect(statusChip(page, 'Account deactivated')).toBeVisible();
    await expect(
      mainText(page, "This account is deactivated. The platform can't reactivate it."),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivate account' })).toHaveCount(0);
  });

  test('disables Suspend and Deactivate on your own account', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    // The actions box is capped from md up, so it is measured on a desktop viewport.
    await page.setViewportSize({ width: 1280, height: 800 });
    await enterPlatform(page, `${ACME}/users/${IDS.jane}`, 'Backend Jane Manager');

    const suspend = page.getByRole('button', { name: 'Suspend account', exact: true });
    const deactivate = page.getByRole('button', { name: 'Deactivate account', exact: true });
    const why =
      "You can't suspend or deactivate your own account. Ask another platform administrator.";
    await expect(suspend).toBeDisabled();
    await expect(deactivate).toBeDisabled();
    await expect(suspend).toHaveAccessibleDescription(why);
    await expect(deactivate).toHaveAccessibleDescription(why);
    // The reason is visible text, not only a description a screen reader reads.
    await expect(mainText(page, why, { exact: true })).toBeVisible();

    // As layer 10's visual pass found: an uncapped caption sizes the actions box (its one-line
    // width) and squeezes the title column, so the box stays within 320 px.
    const box = await suspend.locator('..').boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width).toBeLessThanOrEqual(320);
  });

  test("hides what a read-only role can't do", async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records-read-only');
    await enterPlatform(page, `${ACME}/branches`, 'Acme SACCO');

    // The list has rendered (header + five branches), so the absence below is real.
    await expect(rowsOf(page, 'Branches')).toHaveCount(6);
    await expect(page.getByRole('link', { name: 'Create branch draft' })).toHaveCount(0);

    await page.goto(`${ACME}/users/${R.esi}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Esi Mensah' })).toBeVisible({
      timeout: 15000,
    });
    await expect(statusChip(page, 'Account active')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suspend account' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deactivate account' })).toHaveCount(0);

    // Without tenant.approve there is no bell. A full page load streams the header's Suspense
    // boundary with the document, so the absence isn't a bell that hasn't arrived yet (test 14
    // proves the same page shows it with the code).
    await page.goto('/platform-admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Platform overview' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
  });
});

test.describe('platform records: platform users, overview and notifications', () => {
  test.describe.configure({ timeout: 60000 });

  test("lists the platform's own members and opens one", async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    const rail = page.getByRole('navigation', { name: 'Platform Administration' });
    const platformUsers = rail.getByRole('link', { name: 'Platform users' });
    await expect(platformUsers).toHaveAttribute('href', '/platform-admin/users');
    await platformUsers.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Platform users' })).toBeVisible({
      timeout: 15000,
    });

    // Header + the platform organisation's three members: Sara, Peter, Jane.
    await expect(rowsOf(page, 'Users')).toHaveCount(4);
    await openRecord(page, 'Users', 'Sara Wanjiku');
    await expect(
      page.getByRole('button', { name: 'Reactivate account', exact: true }),
    ).toBeVisible();
    await expect(mainText(page, /in every institution they belong to\./)).toBeVisible();
    // The platform's note doesn't claim an institution's membership.
    await expect(mainText(page, /Their membership here/)).toHaveCount(0);
    await expect(mainText(page, 'Membership in the platform organisation')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to platform users' })).toHaveAttribute(
      'href',
      '/platform-admin/users',
    );
  });

  test('counts institutions by lifecycle, leaving out the platform organisation', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    // Active: Acme and Pwani (the platform organisation is ACTIVE too and is left out). Pending:
    // Mwangaza and Harambee. Drafts: Umoja. Suspended: Kilimo. Operators: Jane and Peter (Sara's
    // account is suspended).
    const counts = [
      ['Active institutions', '2'],
      ['Pending approval', '2'],
      ['Drafts', '1'],
      ['Suspended', '1'],
      ['Platform operators', '2'],
    ] as const;
    for (const [name, value] of counts) {
      await expect(
        page.getByRole('group', { name, exact: true }).getByText(value, { exact: true }),
      ).toBeVisible();
    }
  });

  test('lists what needs attention, oldest first, and links to the directory', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    // Header + pending (oldest first: Mwangaza 3 Sep, Harambee 4 Sep), then the draft (Umoja).
    const rows = rowsOf(page, 'Institutions needing attention');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1)).toContainText('Mwangaza Savings SACCO');
    await expect(rows.nth(2)).toContainText('Harambee Farmers SACCO');
    await expect(rows.nth(3)).toContainText('Umoja Teachers SACCO');

    await page.getByRole('link', { name: 'Review pending institutions', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'SACCO institutions' })).toBeVisible({
      timeout: 15000,
    });
    await expectParam(page, 'status', 'PENDING_APPROVAL');
    await expectParam(page, 'sortBy', 'createdAt');
    await expectParam(page, 'sortDir', 'ASC');
  });

  test('shows the pending approvals on the bell and opens them', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    const bell = page.getByRole('button', {
      name: 'Notifications: 2 institutions waiting for approval',
    });
    await expect(bell).toBeVisible();
    await expectHydrated(bell);
    await bell.click();

    const dialog = page.getByRole('dialog', { name: 'Notifications' });
    await expect(dialog).toContainText('2 institutions are waiting for approval.');
    await dialog.getByRole('link', { name: 'Review pending institutions' }).click();

    // The link closes the dialog (asserted first: an open modal hides the page's h1 from the
    // accessibility tree, so the heading below would otherwise fail for the wrong reason).
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'SACCO institutions' })).toBeVisible({
      timeout: 15000,
    });
    // The tile's own list (PENDING_HREF): pending approval, oldest first.
    await expectParam(page, 'status', 'PENDING_APPROVAL');
    await expectParam(page, 'sortBy', 'createdAt');
    await expectParam(page, 'sortDir', 'ASC');
  });

  test('updates the counts after an approval', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    // Another operator created and submitted Harambee, so the maker-checker lets Jane approve it
    // (Mwangaza, which Jane submitted, would be refused).
    await page.goto(`/platform-admin/tenants/${T.harambee}`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Harambee Farmers SACCO' }),
    ).toBeVisible({ timeout: 15000 });
    await act(page, 'Approve');
    await expect(toast(page, 'Approved. Provisioning is queued.')).toBeVisible();

    await page.goto('/platform-admin');
    await expect(
      page.getByRole('group', { name: 'Pending approval', exact: true }).getByText('1', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Notifications: 1 institution waiting for approval' }),
    ).toBeVisible();
  });
});

test.describe('platform records: ids', () => {
  test.describe.configure({ timeout: 60000 });

  test('answers unknown, malformed and platform-organisation ids with the not-found page', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    // `leaks`: the heading the other institution's record would show, which must never reach the
    // page. Both other-institution rows rely on the backend scoping the read, which the fake does.
    const cases: { path: string; leaks?: string }[] = [
      { path: `${ACME}/branches/17000000-0000-4000-8000-0000000000ff` },
      // Pwani's head office under Acme's URL.
      { path: `${ACME}/branches/${R.pwaniHeadOffice}`, leaks: 'Head Office' },
      // Acme's Achieng under Pwani's URL.
      { path: `/platform-admin/tenants/${T.pwani}/users/${R.achieng}`, leaks: 'Achieng Odera' },
      { path: '/platform-admin/tenants/not-a-uuid/users' },
      { path: `/platform-admin/tenants/${IDS.platformOrganisation}/branches` },
      { path: `/platform-admin/tenants/${IDS.platformOrganisation}/users/${IDS.jane}` },
      { path: '/platform-admin/users/not-a-uuid' },
    ];
    for (const { path, leaks } of cases) {
      await page.goto(path);
      await expect(notFoundHeading(page), path).toBeVisible({ timeout: 15000 });
      if (leaks) await expect(page.getByRole('heading', { name: leaks }), path).toHaveCount(0);
    }
  });

  test('canonicalises mixed-case ids', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'platform-records');
    await enterPlatform(page, '/platform-admin', 'Platform overview');

    await page.goto(`${ACME}/branches/${R.acmeMombasaRoad.toUpperCase()}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Mombasa Road Branch' })).toBeVisible({
      timeout: 15000,
    });
    // The record resolves from the upper-cased id (lower-cased before the read: the fake's lookup
    // is case-sensitive). Its links are canonical; Acme's id has no letters, so the tenant id's
    // canonicalisation is pinned by records-id-guard.test.tsx, not here.
    await expect(page.getByRole('main').getByRole('link', { name: 'Head Office' })).toHaveAttribute(
      'href',
      `${ACME}/branches/${R.acmeHeadOffice}`,
    );
    await expect(page.getByRole('link', { name: 'Back to branches' })).toHaveAttribute(
      'href',
      `${ACME}/branches`,
    );
  });
});

const SURFACES = [
  // `regions`: each landmark name's expected count (rule 21: axe rates landmark-unique moderate,
  // so the serious/critical scan can't see two landmarks sharing a name).
  {
    label: 'branches tab',
    path: `${ACME}/branches`,
    heading: 'Acme SACCO',
    regions: { Branches: 1, 'Branches table': 1 },
  },
  {
    label: 'branch record (100 characters)',
    path: `${ACME}/branches/${R.acmeLikoni}`,
    heading: LONG_BRANCH_NAME,
  },
  { label: 'branch draft', path: `${ACME}/branches/new`, heading: 'Create branch draft' },
  {
    label: 'users tab',
    path: `${ACME}/users`,
    heading: 'Acme SACCO',
    regions: { Users: 1, 'Users table': 1 },
  },
  {
    label: 'user record (100 characters)',
    path: `${ACME}/users/${R.nyokabi}`,
    heading: LONG_ACCOUNT_NAME,
  },
  {
    label: 'deactivate dialog',
    path: `${ACME}/users/${R.esi}`,
    heading: 'Esi Mensah',
    open: async (page: Page) => {
      const trigger = page.getByRole('button', { name: 'Deactivate account', exact: true });
      await expectHydrated(trigger);
      await trigger.click();
      await expect(
        page.getByRole('alertdialog', { name: "Deactivate Esi Mensah's account?" }),
      ).toBeVisible();
      // Scan once the fade has finished: axe blends ancestor opacity into colour contrast.
      await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity', '1');
    },
  },
  {
    label: 'platform users',
    path: '/platform-admin/users',
    heading: 'Platform users',
    regions: { Users: 0, 'Users table': 1 },
  },
  {
    label: 'overview and notifications',
    path: '/platform-admin',
    heading: 'Platform overview',
    regions: { 'Needs attention': 1, 'Needs attention table': 1 },
    // Two scans: the page, then the open popover.
    then: async (page: Page) => {
      const bell = page.getByRole('button', { name: /^Notifications/ });
      await expectHydrated(bell);
      await bell.click();
      await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
      await expect(page.locator('.MuiPopover-paper')).toHaveCSS('opacity', '1');
    },
  },
] as const;

// The describe's title is what the two --grep chunks select on ("accessibility …(light" and
// "accessibility …(dark"): the grep text is project, file, describe and test title joined by spaces.
test.describe('platform records: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, 'platform-records');
        await enterPlatform(page, surface.path, surface.heading);
        // The bell streams behind its own Suspense boundary: every scan and the 375 px page-width
        // check include the finished header.
        await expect(page.getByRole('button', { name: /^Notifications/ })).toBeVisible();
        if ('open' in surface) await surface.open(page);
        await expectA11yCaseApplied(page, a11yCase);
        await expectNoSeriousOrCriticalViolations(page);
        if ('regions' in surface) {
          for (const [name, count] of Object.entries(surface.regions)) {
            await expect(page.getByRole('region', { name, exact: true })).toHaveCount(count);
          }
        }
        if ('then' in surface) {
          await surface.then(page);
          await expectNoSeriousOrCriticalViolations(page);
        }
      });
    }
  }
});
