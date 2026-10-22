import { type ComponentProps, isValidElement, Suspense, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { SelectedContextProfile } from '@/auth/context-service';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';
import { OverviewCardSkeleton } from '@/modules/administration/overview/components/overview-card-skeleton';
import {
  ACTIVITY_DESCRIPTION,
  ACTIVITY_LINK,
  APPROVALS_DESCRIPTION,
  APPROVALS_LINK,
  BUSINESS_DATE_DESCRIPTION,
  BUSINESS_DATE_LINK,
} from '@/modules/administration/overview/overview-rules';
import { READINESS_DESCRIPTION } from '@/modules/administration/overview/readiness-rules';
import { renderWithProviders } from '@/test/test-utils';

const { getCurrentContextProfile } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn<() => Promise<SelectedContextProfile>>(),
}));

vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile(),
}));
// The cards read on their own (their tests pin the reads): here each stands in as its props.
vi.mock('@/modules/administration/overview/components/business-date-card', () => ({
  BusinessDateSection: () => <p>Business date card</p>,
}));
vi.mock('@/modules/administration/overview/components/pending-approvals-card', () => ({
  PendingApprovalsSection: (props: Record<string, unknown>) => (
    <p>{`Pending approvals card ${JSON.stringify(props)}`}</p>
  ),
}));
vi.mock('@/modules/administration/overview/components/readiness-card', () => ({
  ReadinessSection: (props: Record<string, unknown>) => (
    <p>{`Readiness card ${JSON.stringify(props)}`}</p>
  ),
}));
vi.mock('@/modules/administration/overview/components/recent-activity-card', () => ({
  RecentActivitySection: (props: Record<string, unknown>) => (
    <p>{`Recent activity card ${JSON.stringify(props)}`}</p>
  ),
}));

const { default: AdminOverviewPage } = await import('./page');

const EVERY_CODE = [
  'business_date.view',
  'user.approve',
  'user.view',
  'branch.activate',
  'branch.view',
  'settings.view',
  'membership.view',
  'audit.view',
  'tenant.view',
];

const PROFILE: BackendProfile = {
  user_id: '14e10000-0000-4000-8000-0000000000aa',
  keycloak_subject: 'kc-admin',
  email: null,
  full_name: null,
  organisation: {
    id: '14e10000-0000-4000-8000-0000000000bb',
    code: 'greenfield',
    name: 'Greenfield SACCO',
    status: 'ACTIVE',
  },
  membership: { id: '14e10000-0000-4000-8000-0000000000cc', status: 'ACTIVE' },
  selected_branch: null,
  branches: [],
  roles: [],
  permissions: [],
};

function resolved(
  permissions: string[],
  branch: ApplicationContext['branch'] = null,
  module: ApplicationContext['module'] = { id: 'administration', name: 'Administration' },
  organisation: BackendProfile['organisation'] = PROFILE.organisation,
) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { ...PROFILE, permissions, organisation },
    context: {
      module,
      organization: { id: '14e10000-0000-4000-8000-0000000000bb', name: 'Greenfield SACCO' },
      branch,
    },
  });
}

async function show() {
  return renderWithProviders(<>{await AdminOverviewPage()}</>);
}

type SkeletonProps = ComponentProps<typeof OverviewCardSkeleton>;

/** Each Suspense boundary's fallback props, in order, walking the element tree the page returns. */
function fallbacks(node: ReactNode): (SkeletonProps | 'not a card skeleton')[] {
  if (Array.isArray(node)) return node.flatMap((child: ReactNode) => fallbacks(child));
  if (!isValidElement<{ children?: ReactNode; fallback?: ReactNode }>(node)) return [];
  if (node.type === Suspense) {
    const fallback = node.props.fallback;
    return [
      isValidElement<SkeletonProps>(fallback) && fallback.type === OverviewCardSkeleton
        ? fallback.props
        : 'not a card skeleton',
    ];
  }
  return fallbacks(node.props.children);
}

const cards = () =>
  screen.getAllByText(/card/).map((paragraph) => paragraph.textContent.split(' {')[0]);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('AdminOverviewPage', () => {
  it('keeps its one h1 and shows every card, in order, to a holder of every code', async () => {
    resolved(EVERY_CODE);
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeInTheDocument();
    expect(cards()).toEqual([
      'Business date card',
      'Pending approvals card',
      'Readiness card',
      'Recent activity card',
    ]);
    expect(
      screen.getByText(
        'Pending approvals card {"users":true,"branches":true,"branchSelected":false,"canSwitch":false}',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `Readiness card ${JSON.stringify({ permissions: EVERY_CODE, organisationStatus: 'ACTIVE' })}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Recent activity card {"names":true,"timeZone":true}'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('puts each card behind its own Suspense boundary and skeleton (spec §6.3)', async () => {
    resolved(EVERY_CODE);
    expect(fallbacks(await AdminOverviewPage())).toEqual([
      {
        title: 'Business date',
        description: BUSINESS_DATE_DESCRIPTION,
        action: BUSINESS_DATE_LINK,
        shape: 'date',
      },
      {
        title: 'Pending approvals',
        description: APPROVALS_DESCRIPTION,
        action: APPROVALS_LINK,
        rows: 5,
      },
      {
        title: 'Operational readiness',
        description: READINESS_DESCRIPTION,
        shape: 'readiness',
        rows: 5,
      },
      {
        title: 'Recent activity',
        description: ACTIVITY_DESCRIPTION,
        action: ACTIVITY_LINK,
        rows: 5,
      },
    ]);
  });

  it('omits a card the holder could never read or act on (Ruling 2)', async () => {
    resolved(['branch.activate', 'branch.view', 'user.view']);
    await show();

    expect(cards()).toEqual(['Pending approvals card', 'Readiness card']);
    expect(
      screen.getByText(
        'Pending approvals card {"users":false,"branches":true,"branchSelected":false,"canSwitch":false}',
      ),
    ).toBeInTheDocument();
  });

  it("passes the profile's organisation status to the readiness card (Ruling 3)", async () => {
    resolved(EVERY_CODE, null, undefined, {
      id: '14e10000-0000-4000-8000-0000000000bb',
      code: 'greenfield',
      name: 'Greenfield SACCO',
      status: 'SUSPENDED',
    });
    await show();

    expect(
      screen.getByText(
        `Readiness card ${JSON.stringify({ permissions: EVERY_CODE, organisationStatus: 'SUSPENDED' })}`,
      ),
    ).toBeInTheDocument();
  });

  it('tells the approvals card a branch is selected', async () => {
    resolved(EVERY_CODE, { id: '14e10000-0000-4000-8000-0000000000dd', name: 'Head Office' });
    await show();

    expect(
      screen.getByText(
        'Pending approvals card {"users":true,"branches":true,"branchSelected":true,"canSwitch":false}',
      ),
    ).toBeInTheDocument();
  });

  it('tells the approvals card the account can switch with two active branches', async () => {
    // A SUSPENDED branch doesn't count (PF1): two ACTIVE ones make All branches selectable.
    getCurrentContextProfile.mockResolvedValue({
      kind: 'resolved',
      profile: {
        ...PROFILE,
        permissions: EVERY_CODE,
        branches: [
          {
            id: '14e10000-0000-4000-8000-0000000000dd',
            code: 'HQ',
            name: 'Head Office',
            status: 'ACTIVE',
          },
          {
            id: '14e10000-0000-4000-8000-0000000000ee',
            code: 'WL',
            name: 'Westlands',
            status: 'ACTIVE',
          },
          {
            id: '14e10000-0000-4000-8000-0000000000ff',
            code: 'KS',
            name: 'Kisumu',
            status: 'SUSPENDED',
          },
        ],
      },
      context: {
        module: { id: 'administration', name: 'Administration' },
        organization: { id: '14e10000-0000-4000-8000-0000000000bb', name: 'Greenfield SACCO' },
        branch: { id: '14e10000-0000-4000-8000-0000000000dd', name: 'Head Office' },
      },
    });
    await show();

    expect(
      screen.getByText(
        'Pending approvals card {"users":true,"branches":true,"branchSelected":true,"canSwitch":true}',
      ),
    ).toBeInTheDocument();
  });

  it('tells the activity card which lookups the holder may make (rule 5)', async () => {
    resolved(['audit.view']);
    await show();

    expect(
      screen.getByText('Recent activity card {"names":false,"timeZone":false}'),
    ).toBeInTheDocument();
  });

  it('says once, under the heading, that no card applies to a holder of none of the codes', async () => {
    resolved(['iam.profile.read']);
    await show();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Administration Overview' }),
    ).toBeVisible();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Nothing on this overview is available to your role here; the navigation lists the pages you can open.',
    );
    expect(screen.queryByText(/card/)).toBeNull();
  });

  it('renders the heading alone, reading nothing, in the platform context', async () => {
    resolved(EVERY_CODE, null, { id: 'platform-administration', name: 'Platform Administration' });
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/card/)).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('renders the heading alone for a profile without an organisation', async () => {
    resolved(EVERY_CODE, null, undefined, null);
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/card/)).toBeNull();
  });

  it('renders the heading alone while the context is unresolved', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });
    await show();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/card/)).toBeNull();
  });
});
