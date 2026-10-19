import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { Page } from '@/lib/api/wire';
import type { UserApprovalCounts } from '@/modules/administration/approvals/approval-notifications';
import type { CurrentBusinessDate } from '@/modules/administration/business-date/business-date-contract';
import type { TenantSetting } from '@/modules/administration/settings/settings-contract';
import { contrastRatio } from '@/theme/contrast';
import { DARK, LIGHT } from '@/theme/tokens';
import { renderWithProviders } from '@/test/test-utils';
import { NOT_PERMITTED } from '../readiness-rules';

const reads = vi.hoisted(() => ({
  countActiveBranches: vi.fn<() => Promise<number>>(),
  countActiveMemberships: vi.fn<() => Promise<number>>(),
  countBranchActivations: vi.fn<() => Promise<number>>(),
  countUserApprovals: vi.fn<() => Promise<UserApprovalCounts>>(),
  getBusinessDate: vi.fn<() => Promise<CurrentBusinessDate>>(),
  listSettings: vi.fn<() => Promise<Page<TenantSetting>>>(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/modules/administration/approvals/approval-service', () => ({
  countBranchActivations: () => reads.countBranchActivations(),
  countUserApprovals: () => reads.countUserApprovals(),
}));
vi.mock('@/modules/administration/business-date/business-date-service', () => ({
  getBusinessDate: () => reads.getBusinessDate(),
}));
vi.mock('@/modules/administration/settings/settings-service', () => ({
  listSettings: () => reads.listSettings(),
}));
vi.mock('../overview-service', () => ({
  countActiveBranches: () => reads.countActiveBranches(),
  countActiveMemberships: () => reads.countActiveMemberships(),
}));

const { ReadinessSection } = await import('./readiness-card');

const EVERY_CODE = [
  'settings.view',
  'branch.view',
  'membership.view',
  'user.view',
  'user.approve',
  'business_date.view',
];
const REFERENCE = '14a20000-0000-4000-8000-0000000000aa';

const setting = (key: string, value: string | null): TenantSetting => ({
  key,
  value,
  redacted: false,
  platformAdminOnly: false,
});

function settled() {
  reads.listSettings.mockResolvedValue({
    items: [setting('base_currency', 'KES'), setting('default_timezone', 'Africa/Nairobi')],
    page: {
      number: 0,
      size: 100,
      totalItems: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
  });
  reads.countActiveBranches.mockResolvedValue(2);
  reads.countBranchActivations.mockResolvedValue(0);
  reads.countActiveMemberships.mockResolvedValue(2);
  reads.countUserApprovals.mockResolvedValue({ pending: 0, provisioning: 0 });
  reads.getBusinessDate.mockResolvedValue({ date: '07-09-2026', status: 'OPEN' });
}

async function show(permissions: string[] = EVERY_CODE, organisationStatus = 'ACTIVE') {
  return renderWithProviders(<>{await ReadinessSection({ permissions, organisationStatus })}</>);
}

/** The item whose h3 is `label`, as a list item. */
function itemOf(label: string) {
  const card = screen.getByRole('region', { name: 'Operational readiness' });
  const heading = within(card).getByRole('heading', { level: 3, name: label });
  const entry = heading.closest('li');
  if (!entry) throw new Error(`no list item holds ${label}`);
  return entry;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ReadinessSection', () => {
  it('shows five ready items under a full teal bar named for the card', async () => {
    settled();
    await show();

    const bar = screen.getByRole('progressbar', { name: 'Operational readiness' });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuetext', '5 of 5 ready');
    expect(bar.className).toMatch(/colorSuccess/);
    const card = screen.getByRole('region', { name: 'Operational readiness' });
    expect(within(card).getByText('5 of 5 ready')).toBeInTheDocument();
    expect(
      within(card)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Institution profile', 'Branches', 'People', 'Onboarding', 'Business date']);
    expect(within(card).getAllByText('Ready')).toHaveLength(5);
    expect(itemOf('Business date')).toHaveTextContent('Open for Mon, 7 Sep 2026.');
  });

  it('links each item to the page where it is dealt with (Ruling 12)', async () => {
    settled();
    await show();

    for (const [label, name, href] of [
      ['Institution profile', 'Open settings', '/admin/settings'],
      ['Branches', 'Open branches', '/admin/branches'],
      ['People', 'Open users & access', '/admin/users'],
      ['Onboarding', 'Open user onboarding', '/admin/approvals/users'],
      ['Business date', 'Open business date', '/admin/business-date'],
    ] as const) {
      expect(within(itemOf(label)).getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it("offers no link to a page the holder can't open", async () => {
    settled();
    await show(['branch.view', 'membership.view']);

    expect(within(itemOf('Branches')).getByRole('link')).toHaveAccessibleName('Open branches');
    for (const label of ['Institution profile', 'People', 'Onboarding', 'Business date']) {
      expect(within(itemOf(label)).queryByRole('link')).not.toBeInTheDocument();
    }
  });

  it("reads nothing an item's code doesn't allow, and says it can't be checked", async () => {
    settled();
    await show(['branch.view']);

    expect(reads.countActiveBranches).toHaveBeenCalledOnce();
    expect(reads.countBranchActivations).toHaveBeenCalledOnce();
    for (const read of [
      reads.listSettings,
      reads.countActiveMemberships,
      reads.countUserApprovals,
      reads.getBusinessDate,
    ]) {
      expect(read).not.toHaveBeenCalled();
    }
    for (const label of ['Institution profile', 'People', 'Onboarding', 'Business date']) {
      expect(itemOf(label)).toHaveTextContent(NOT_PERMITTED);
      expect(within(itemOf(label)).getByText("Can't be checked", { exact: true })).toBeVisible();
    }
    expect(screen.getByRole('progressbar', { name: 'Operational readiness' })).toHaveAttribute(
      'aria-valuetext',
      '1 of 5 ready · 4 not checked',
    );
  });

  it('reads no branch count without branch.view', async () => {
    settled();
    await show(['membership.view']);

    expect(reads.countActiveMemberships).toHaveBeenCalledOnce();
    expect(reads.countActiveBranches).not.toHaveBeenCalled();
    expect(reads.countBranchActivations).not.toHaveBeenCalled();
    expect(within(itemOf('Branches')).getByText("Can't be checked", { exact: true })).toBeVisible();
  });

  it('marks a failed read on its own item, with its reference, and keeps the rest', async () => {
    settled();
    reads.countActiveMemberships.mockRejectedValue(
      new BackendApiError(503, { requestId: REFERENCE }),
    );
    await show();

    expect(itemOf('People')).toHaveTextContent(`Couldn't be loaded. Reference: ${REFERENCE}`);
    expect(
      within(itemOf('People')).getByText("Couldn't be checked", { exact: true }),
    ).toBeVisible();
    expect(itemOf('Branches')).toHaveTextContent('Ready');
    expect(screen.getByRole('progressbar', { name: 'Operational readiness' })).toHaveAttribute(
      'aria-valuenow',
      '80',
    );
  });

  it('names what needs attention', async () => {
    settled();
    reads.countActiveMemberships.mockResolvedValue(1);
    reads.getBusinessDate.mockResolvedValue({ date: '07-09-2026', status: 'CLOSED' });
    await show();

    expect(within(itemOf('People')).getByText('Needs attention', { exact: true })).toBeVisible();
    expect(itemOf('Business date')).toHaveTextContent('Closed for Mon, 7 Sep 2026.');
    expect(screen.getByText('3 of 5 ready')).toBeInTheDocument();
  });

  it.each([
    ['a lost session to sign-in', new BackendApiError(401), ';/login?reason=session_expired;'],
    [
      'a stale context to context selection',
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
      ';/select-context;',
    ],
  ])('sends %s instead of marking an item', async (_case, error, digest) => {
    settled();
    reads.listSettings.mockRejectedValue(error);
    await expect(
      ReadinessSection({ permissions: EVERY_CODE, organisationStatus: 'ACTIVE' }),
    ).rejects.toMatchObject({ digest: expect.stringContaining(digest) as unknown });
  });

  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)(
    'draws a teal bar that stands out from its track (%s, WCAG 1.4.11)',
    (_scheme, scheme) => {
      expect(contrastRatio(scheme.success.main, scheme.surfaces.tertiary)).toBeGreaterThanOrEqual(
        3,
      );
    },
  );
});
