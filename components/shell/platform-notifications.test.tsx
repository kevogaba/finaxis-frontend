import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import { screen, within } from '@testing-library/react';
import { BackendApiError } from '@/auth/backend-api';
import type { SelectedContextProfile } from '@/auth/context-service';
import type { BackendProfile } from '@/auth/context.types';
import type { ApplicationContext } from '@/config/application-context';
import { renderWithProviders } from '@/test/test-utils';

/** A real `redirect()` throw, outside any mock: it carries the digest `unstable_rethrow` (real, and
 * unmocked here) recognises and forwards, as `load()`'s catch meets it in production. */
function capturedRedirectError(): unknown {
  try {
    redirect('/login');
  } catch (error) {
    return error;
  }
  throw new Error('redirect() did not throw');
}

const { countTenantsInStatus, getCurrentContextProfile } = vi.hoisted(() => ({
  countTenantsInStatus: vi.fn<(status: string) => Promise<number>>(),
  getCurrentContextProfile: vi.fn<() => Promise<SelectedContextProfile>>(),
}));

// `load()`'s catch reads the request headers; `next/navigation` stays real, so `redirect()` and
// `unstable_rethrow` behave as in production.
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: () => getCurrentContextProfile(),
}));
vi.mock('@/modules/platform-administration/overview/overview-service', () => ({
  countTenantsInStatus: (status: string) => countTenantsInStatus(status),
}));

const { PendingInstitutionsNotifications } = await import('./platform-notifications');

const PLATFORM = '00000000-0000-0000-0000-000000000000';

const PROFILE: BackendProfile = {
  user_id: '17000000-0000-4000-8000-0000000000aa',
  keycloak_subject: 'kc-approver',
  email: null,
  full_name: null,
  organisation: null,
  membership: { id: '17000000-0000-4000-8000-0000000000bb', status: 'ACTIVE' },
  selected_branch: null,
  branches: [],
  roles: [],
  permissions: [],
};

const MODULES = {
  platform: { id: 'platform-administration', name: 'Platform Administration' },
  tenant: { id: 'administration', name: 'Administration' },
} as const satisfies Record<string, ApplicationContext['module']>;

/** A resolved context in `module`, holding `permissions`. */
function resolved(permissions: string[], module: ApplicationContext['module'] = MODULES.platform) {
  getCurrentContextProfile.mockResolvedValue({
    kind: 'resolved',
    profile: { ...PROFILE, permissions },
    context: { module, organization: { id: PLATFORM, name: 'Finaxis Platform' }, branch: null },
  });
}

async function show() {
  return renderWithProviders(<>{await PendingInstitutionsNotifications()}</>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('PendingInstitutionsNotifications', () => {
  it('shows the pending count on the bell', async () => {
    resolved(['tenant.view', 'tenant.approve']);
    countTenantsInStatus.mockResolvedValue(2);

    await show();

    const bell = screen.getByRole('button', {
      name: 'Notifications: 2 institutions waiting for approval',
    });
    expect(within(bell).getByText('2')).toBeInTheDocument();
    expect(countTenantsInStatus).toHaveBeenCalledExactlyOnceWith('PENDING_APPROVAL');
  });

  it('reads nothing outside the platform workspace', async () => {
    resolved(['tenant.view', 'tenant.approve'], MODULES.tenant);

    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(countTenantsInStatus).not.toHaveBeenCalled();
  });

  it('reads nothing without tenant.approve and tenant.view', async () => {
    resolved(['tenant.view']);

    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(countTenantsInStatus).not.toHaveBeenCalled();
  });

  it('reads nothing without tenant.view, whatever else it holds', async () => {
    resolved(['tenant.approve']);

    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(countTenantsInStatus).not.toHaveBeenCalled();
  });

  it('reads nothing while the context is not resolved', async () => {
    getCurrentContextProfile.mockResolvedValue({
      kind: 'redirect-to-context-selection',
      reason: 'invalid-context',
    });

    const { container } = await show();

    expect(container).toBeEmptyDOMElement();
    expect(countTenantsInStatus).not.toHaveBeenCalled();
  });

  it("says the count couldn't be loaded instead of none", async () => {
    resolved(['tenant.view', 'tenant.approve']);
    countTenantsInStatus.mockRejectedValue(new BackendApiError(503, {}));

    await show();

    expect(
      screen.getByRole('button', { name: "Notifications (couldn't be loaded)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notifications: nothing waiting' })).toBeNull();
  });

  it('keeps a redirect propagating', async () => {
    resolved(['tenant.view', 'tenant.approve']);
    countTenantsInStatus.mockRejectedValue(capturedRedirectError());

    await expect(PendingInstitutionsNotifications()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('sends a lost session to sign-in instead of reading it as unavailable', async () => {
    resolved(['tenant.view', 'tenant.approve']);
    countTenantsInStatus.mockRejectedValue(new BackendApiError(401));

    // load() redirects to /login?reason=session_expired (rule 21).
    await expect(PendingInstitutionsNotifications()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('sends a stale context to context selection instead of reading it as unavailable', async () => {
    resolved(['tenant.view', 'tenant.approve']);
    countTenantsInStatus.mockRejectedValue(
      new BackendApiError(403, { code: 'invalid_active_tenant_context' }),
    );

    await expect(PendingInstitutionsNotifications()).rejects.toThrow('NEXT_REDIRECT');
  });
});
