import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';
import type { ApplicationContext } from '@/config/application-context';
import type { ProfileUser } from '@/modules/profile/profile-rules';

const { recordAuditTab, requireProfile } = vi.hoisted(() => ({
  recordAuditTab: vi.fn(),
  requireProfile: vi.fn(),
}));
vi.mock('@/modules/profile/profile-service', () => ({
  requireProfile: () => requireProfile() as unknown,
}));
vi.mock('@/modules/administration/audit/components/record-audit-tab', () => ({
  RecordAuditTab: (props: unknown) => {
    recordAuditTab(props);
    return <p>audit tab</p>;
  },
}));

const { default: ProfileActivityPage } = await import('./page');

const USER: ProfileUser = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Jane Manager',
  email: 'jane@greenfield.example',
  roles: [],
  permissions: ['audit.view'],
  branches: [],
  organization: { id: 'org-1', name: 'Greenfield SACCO', code: 'greenfield', status: 'ACTIVE' },
  membershipStatus: 'ACTIVE',
  assignedRoles: [],
};
const TENANT: ApplicationContext = {
  module: { id: 'administration', name: 'Administration' },
  organization: { id: 'org-1', name: 'Greenfield SACCO' },
  branch: null,
};
const PLATFORM: ApplicationContext = {
  module: { id: 'platform-administration', name: 'Platform Administration' },
  organization: { id: 'platform', name: 'Platform' },
  branch: null,
};
const render = async (query: Record<string, string> = {}) => {
  renderWithProviders(await ProfileActivityPage({ searchParams: Promise.resolve(query) }));
};

describe('ProfileActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists what the user performed, paged from the URL', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: TENANT });

    await render({ page: '2' });

    const props = recordAuditTab.mock.calls[0]?.[0] as { params: URLSearchParams };
    expect(props).toMatchObject({
      views: [{ value: 'performed', label: 'Performed by me', filter: { actorId: USER.id } }],
      path: '/profile/activity',
      title: 'Activity',
    });
    expect(props.params.get('page')).toBe('2');
  });

  it('never requests the tenant audit trail in the platform workspace, even with audit.view', async () => {
    requireProfile.mockResolvedValueOnce({ user: USER, context: PLATFORM });

    await render();

    expect(screen.getByText("Activity isn't available in the platform workspace")).toBeVisible();
    expect(recordAuditTab).not.toHaveBeenCalled();
  });

  it('explains a missing audit.view instead of requesting a 403', async () => {
    requireProfile.mockResolvedValueOnce({
      user: { ...USER, permissions: ['user.view'] },
      context: TENANT,
    });

    await render();

    expect(screen.getByText("You don't have permission")).toBeVisible();
    expect(recordAuditTab).not.toHaveBeenCalled();
  });
});
