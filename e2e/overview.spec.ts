import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  A11Y_CASES,
  applyA11yCase,
  expectA11yCaseApplied,
  expectNoSeriousOrCriticalViolations,
} from './support/admin';
import { authenticate, expectHydrated, selectMuiOption } from './support/auth';
import {
  OVERVIEW_SCENARIO_IDS as OVERVIEW,
  OVERVIEW_SCENARIO_TEXT as TEXT,
} from './fake-api/scenarios.mts';

const ALL_BRANCHES = /All branches \(institution level\)/;
const HEAD_OFFICE = /Head Office/;

/** A route's first hit compiles under a cold `next dev`, which takes tens of seconds (layer 11's
 * lesson): every first visit here (the overview, a request page, the audit trail) is bounded by it.
 * Warm, these waits resolve in well under a second. */
const FIRST_HIT = 45000;

// The app's copy, repeated here: Playwright can't resolve the app's `@/` imports. Each string is
// asserted verbatim, so a reworded message fails here (rule 10).
const NOT_PERMITTED = "Can't be checked with your permissions.";
const NOTHING_WAITING = 'Nothing is waiting for your approval.';
const PROVISIONING = '1 identity is still being provisioned: approval already ran.';
const ONE_MEMBER =
  'Only 1 member is active. Approvals need at least two, so someone other than the requester can decide (maker-checker).';
const NOT_SET = "Not set: default timezone and base currency. Settings can't be saved yet.";

/** The overview through context selection (All branches unless told), once every card has
 * streamed in. `/admin` and `/select-context` are first hits: the picker waits for them. */
async function enterOverview(page: Page, branch: RegExp = ALL_BRANCHES) {
  await page.goto('/admin');
  await expect(page.getByRole('combobox', { name: 'Organisation' })).toBeVisible({
    timeout: FIRST_HIT,
  });
  await selectMuiOption(page, 'Organisation', /Greenfield/);
  await selectMuiOption(page, 'Branch', branch);
  await settled(page);
}

/** The heading, then no card skeleton left: each card streams behind its own Suspense boundary,
 * and a skeleton's body is `aria-busy` until its card arrives. */
async function settled(page: Page) {
  await expect(page).toHaveURL((url) => url.pathname === '/admin', { timeout: FIRST_HIT });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Administration Overview' }),
  ).toBeVisible({ timeout: FIRST_HIT });
  await expect(page.getByRole('main').locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout: FIRST_HIT,
  });
}

const card = (page: Page, name: string) =>
  page.getByRole('main').getByRole('region', { name, exact: true });

/** A readiness item: the list item under its h3. */
const item = (page: Page, label: string) =>
  card(page, 'Operational readiness')
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 3, name: label, exact: true }) });

/** The bell streams in the header behind its own boundary: wait for it before a scan. */
async function bell(page: Page, label: string) {
  await expect(
    page.getByRole('banner').getByRole('button', { name: label, exact: true }),
  ).toBeVisible({ timeout: FIRST_HIT });
}

/** The Review links of the preview, in order, each by its exact name. */
async function expectRequests(approvals: Locator, names: readonly string[]) {
  const rows = approvals
    .getByRole('list', { name: 'Requests waiting for a decision', exact: true })
    .getByRole('listitem');
  await expect(rows).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(
      rows.nth(index).getByRole('link', { name: `Review ${name}`, exact: true }),
    ).toBeVisible();
  }
}

/** Each item's detail, and its chip by its exact words (a detail can hold the chip's words). */
async function expectItems(page: Page, state: string, items: readonly [string, string][]) {
  for (const [label, detail] of items) {
    await expect(item(page, label)).toContainText(detail);
    await expect(item(page, label).getByText(state, { exact: true })).toBeVisible();
  }
}

/** Each item's link by its exact name, or none: `null` where the holder can't open the page. */
async function expectLinks(page: Page, links: readonly [string, string | null, string?][]) {
  for (const [label, name, href] of links) {
    const found = item(page, label).getByRole('link');
    if (name === null) {
      await expect(found).toHaveCount(0);
    } else {
      await expect(found).toHaveAccessibleName(name);
      await expect(found).toHaveAttribute('href', href ?? '');
    }
  }
}

test.describe('overview: the cards', () => {
  test.describe.configure({ timeout: 90000 });

  test('shows every card ready, with nothing waiting', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'overview-ready');
    await enterOverview(page);

    await expect(page.getByRole('main').getByRole('region')).toHaveCount(4);
    const date = card(page, 'Business date');
    await expect(date).toContainText('Monday, 7 September 2026');
    await expect(date.getByText('Open', { exact: true })).toBeVisible();
    await expect(
      date.getByRole('link', { name: 'Open business date', exact: true }),
    ).toHaveAttribute('href', '/admin/business-date');

    const approvals = card(page, 'Pending approvals');
    await expect(approvals).toContainText(NOTHING_WAITING);
    await expect(
      approvals.getByRole('link', { name: 'Open the approval queue', exact: true }),
    ).toHaveAttribute('href', '/admin/approvals');

    const bar = card(page, 'Operational readiness').getByRole('progressbar', {
      name: 'Operational readiness',
    });
    await expect(bar).toHaveAttribute('aria-valuenow', '100');
    await expect(bar).toHaveAttribute('aria-valuetext', '5 of 5 ready');
    await expectItems(page, 'Ready', [
      ['Institution profile', 'Active, with a default timezone and a base currency.'],
      ['Branches', '2 branches are active, and none is waiting for activation.'],
      ['People', '2 members are active.'],
      ['Onboarding', 'No one is waiting for approval.'],
      ['Business date', 'Open for Mon, 7 Sep 2026.'],
    ]);
    await expectLinks(page, [
      ['Institution profile', 'Open settings', '/admin/settings'],
      ['Branches', 'Open branches', '/admin/branches'],
      ['People', 'Open users & access', '/admin/users'],
      ['Onboarding', 'Open user onboarding', '/admin/approvals/users'],
      ['Business date', 'Open business date', '/admin/business-date'],
    ]);

    const activity = card(page, 'Recent activity');
    await expect(activity).toContainText('The latest events. Times in Africa/Nairobi.');
    const events = activity
      .getByRole('list', { name: 'Latest events', exact: true })
      .getByRole('listitem');
    await expect(events).toHaveCount(5);
    await expect(events.first()).toHaveText('Sent welcome emailSystem · 08 Sep 2026 · 09:00');
    await expect(events.nth(1)).toHaveText(
      'Invited userBackend Jane Manager · 07 Sep 2026 · 10:59',
    );
    await expect(
      activity.getByRole('link', { name: 'View all activity', exact: true }),
    ).toHaveAttribute('href', '/admin/audit');
  });

  test('names what needs attention, users first, then branches', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);
    await bell(page, 'Notifications: 6 approvals waiting');

    const date = card(page, 'Business date');
    await expect(date).toContainText('Monday, 7 September 2026');
    await expect(date.getByText('Closed', { exact: true })).toBeVisible();

    const approvals = card(page, 'Pending approvals');
    await expect(approvals).toContainText('3 users are waiting for approval.');
    await expect(
      approvals.getByRole('link', { name: 'Review user onboarding', exact: true }),
    ).toHaveAttribute('href', '/admin/approvals/users');
    await expect(approvals).toContainText('3 branches are waiting for activation.');
    await expect(
      approvals.getByRole('link', { name: 'Review branch activation', exact: true }),
    ).toHaveAttribute('href', '/admin/approvals/branches');
    await expectRequests(approvals, [
      'Wanjiku Kariuki',
      TEXT.longName,
      'Halima Odhiambo',
      TEXT.longBranch,
      'Nyeri Branch',
    ]);
    await expect(
      approvals.getByRole('link', { name: 'Review Halima Odhiambo', exact: true }),
    ).toHaveAttribute('href', `/admin/approvals/users/${OVERVIEW.halima}`);
    await expect(
      approvals.getByRole('link', { name: 'Review Nyeri Branch', exact: true }),
    ).toHaveAttribute('href', `/admin/approvals/branches/${OVERVIEW.nyeri}`);
    await expect(approvals.getByRole('note')).toHaveText(PROVISIONING);

    const bar = card(page, 'Operational readiness').getByRole('progressbar', {
      name: 'Operational readiness',
    });
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    await expect(bar).toHaveAttribute('aria-valuetext', '0 of 5 ready');
    await expectItems(page, 'Needs attention', [
      ['Institution profile', NOT_SET],
      ['Branches', '2 branches are active. 3 branches are waiting for activation.'],
      ['People', ONE_MEMBER],
      ['Onboarding', `3 users are waiting for approval. ${PROVISIONING}`],
      ['Business date', 'Closed for Mon, 7 Sep 2026.'],
    ]);
  });

  test("omits what the holder can't read, and says what it can't check", async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'overview-limited');
    await enterOverview(page);
    await bell(page, 'Notifications: 3 approvals waiting');

    await expect(page.getByRole('main').getByRole('region')).toHaveCount(2);
    await expect(card(page, 'Business date')).toHaveCount(0);
    await expect(card(page, 'Recent activity')).toHaveCount(0);

    const approvals = card(page, 'Pending approvals');
    await expect(approvals).toContainText('3 branches are waiting for activation.');
    await expect(
      approvals.getByRole('link', { name: 'Review user onboarding', exact: true }),
    ).toHaveCount(0);
    await expectRequests(approvals, [TEXT.longBranch, 'Nyeri Branch', 'Kakamega Branch']);
    await expect(approvals.getByRole('note')).toHaveCount(0);

    await expect(
      card(page, 'Operational readiness').getByRole('progressbar', {
        name: 'Operational readiness',
      }),
    ).toHaveAttribute('aria-valuetext', '0 of 5 ready · 3 not checked');
    await expectItems(page, "Can't be checked", [
      ['Institution profile', NOT_PERMITTED],
      ['People', NOT_PERMITTED],
      ['Business date', NOT_PERMITTED],
    ]);
    await expectItems(page, 'Needs attention', [
      ['Onboarding', `3 users are waiting for approval. ${PROVISIONING}`],
    ]);
    await expectLinks(page, [
      ['Institution profile', null],
      ['Branches', 'Open branches', '/admin/branches'],
      ['People', 'Open users & access', '/admin/users'],
      ['Onboarding', null],
      ['Business date', null],
    ]);
  });

  test('marks a refused branch read on its own item and card, keeping the rest (BG-33)', async ({
    context,
    page,
  }, testInfo) => {
    await authenticate(context, testInfo, 'overview-branch-scoped');
    await enterOverview(page, HEAD_OFFICE);
    await bell(page, "Notifications (couldn't be loaded)");

    await expect(page.getByRole('main').getByRole('region')).toHaveCount(4);
    await expectItems(page, "Couldn't be checked", [
      ['Branches', "Couldn't be loaded. Reference: "],
    ]);
    await expect(
      card(page, 'Operational readiness').getByRole('progressbar', {
        name: 'Operational readiness',
      }),
    ).toHaveAttribute('aria-valuetext', '0 of 5 ready · 1 not checked');
    await expectItems(page, 'Needs attention', [
      ['Institution profile', NOT_SET],
      ['People', ONE_MEMBER],
      ['Onboarding', `3 users are waiting for approval. ${PROVISIONING}`],
    ]);

    const approvals = card(page, 'Pending approvals');
    await expect(approvals.getByRole('alert')).toContainText(
      "Branches waiting for activation couldn't be loaded.",
    );
    await expect(approvals).not.toContainText(NOTHING_WAITING);
    await expectRequests(approvals, ['Wanjiku Kariuki', TEXT.longName, 'Halima Odhiambo']);

    await expect(card(page, 'Business date').getByText('Closed', { exact: true })).toBeVisible();
    await expect(
      card(page, 'Recent activity')
        .getByRole('list', { name: 'Latest events', exact: true })
        .getByRole('listitem'),
    ).toHaveCount(5);
  });

  test('opens a request from its Review link', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);

    const review = card(page, 'Pending approvals').getByRole('link', {
      name: 'Review Halima Odhiambo',
      exact: true,
    });
    await expectHydrated(review);
    await review.click();
    await expect(page).toHaveURL(
      (url) => url.pathname === `/admin/approvals/users/${OVERVIEW.halima}`,
      { timeout: FIRST_HIT },
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Halima Odhiambo' })).toBeVisible({
      timeout: FIRST_HIT,
    });
  });

  test('opens an event from the activity', async ({ context, page }, testInfo) => {
    await authenticate(context, testInfo, 'overview-attention');
    await enterOverview(page);

    const event = card(page, 'Recent activity').getByRole('link', {
      name: 'View event: Sent welcome email, 08 Sep 2026 09:00',
      exact: true,
    });
    await expectHydrated(event);
    await event.click();
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/admin/audit' && url.searchParams.get('event') === OVERVIEW.welcomeEvent,
      { timeout: FIRST_HIT },
    );
    await expect(page.getByRole('dialog', { name: 'Sent welcome email' })).toBeVisible({
      timeout: FIRST_HIT,
    });
  });
});

const SURFACES = [
  {
    label: 'every card ready',
    scenario: 'overview-ready',
    branch: ALL_BRANCHES,
    bell: 'Notifications: nothing waiting',
    regions: 4,
  },
  {
    label: 'needs attention',
    scenario: 'overview-attention',
    branch: ALL_BRANCHES,
    bell: 'Notifications: 6 approvals waiting',
    regions: 4,
  },
  {
    label: 'limited permissions',
    scenario: 'overview-limited',
    branch: ALL_BRANCHES,
    bell: 'Notifications: 3 approvals waiting',
    regions: 2,
  },
  {
    label: 'a refused branch read',
    scenario: 'overview-branch-scoped',
    branch: HEAD_OFFICE,
    bell: "Notifications (couldn't be loaded)",
    regions: 4,
  },
] as const;

test.describe('overview: accessibility', () => {
  test.describe.configure({ timeout: 60000 });

  for (const surface of SURFACES) {
    for (const a11yCase of A11Y_CASES) {
      test(`has no serious or critical violations: ${surface.label} (${a11yCase.colorScheme}, ${a11yCase.label})`, async ({
        context,
        page,
      }, testInfo) => {
        await applyA11yCase(page, a11yCase);
        await authenticate(context, testInfo, surface.scenario);
        await enterOverview(page, surface.branch);
        // The header streams too: every scan and the 375 px page-width check include the bell.
        await bell(page, surface.bell);
        await expectA11yCaseApplied(page, a11yCase);
        await expect(page.getByRole('main').getByRole('region')).toHaveCount(surface.regions);
        await expectNoSeriousOrCriticalViolations(page);
      });
    }
  }
});
