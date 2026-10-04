import { beforeEach, describe, expect, it, vi } from 'vitest';

// Lettered, so its upper-case form differs from it.
const PLATFORM = 'abcdef01-2345-4678-89ab-cdef01234567';
const INSTITUTION = '16000000-0000-4000-8000-000000000001';

const { getCurrentContextProfile, getTenant } = vi.hoisted(() => ({
  getCurrentContextProfile: vi.fn(),
  getTenant: vi.fn(),
}));

vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/config/env.server', () => ({ serverEnv: { PLATFORM_ORGANISATION_ID: PLATFORM } }));
vi.mock('@/auth/context-service', () => ({
  getCurrentContextProfile: (...args: unknown[]) => getCurrentContextProfile(...args) as unknown,
}));
vi.mock('@/modules/platform-administration/tenants/tenant-service', () => ({
  getTenant: (...args: unknown[]) => getTenant(...args) as unknown,
}));

const { default: RecordLayout } = await import('./(record)/layout');
const { default: OverviewPage } = await import('./(record)/page');
const { default: ProvisioningPage } = await import('./(record)/provisioning/page');
const { default: AmendPage } = await import('./amend/page');

const routes = {
  'the record layout': (tenantId: string) =>
    RecordLayout({ children: null, params: Promise.resolve({ tenantId }) }),
  'the Overview tab': (tenantId: string) => OverviewPage({ params: Promise.resolve({ tenantId }) }),
  'the Provisioning tab': (tenantId: string) =>
    ProvisioningPage({ params: Promise.resolve({ tenantId }) }),
  'the amend page': (tenantId: string) => AmendPage({ params: Promise.resolve({ tenantId }) }),
};

describe.each(Object.entries(routes))('%s', (_name, render) => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentContextProfile.mockResolvedValue({ kind: 'unresolved' });
    getTenant.mockRejectedValue(new Error('unreachable backend'));
  });

  it.each([
    ['the platform organisation', PLATFORM],
    ['the platform organisation in upper case', PLATFORM.toUpperCase()],
    ['a malformed id', 'pwani-fishermen'],
    ['a path-like id', '../x'],
    ['an empty id', ''],
  ])('answers not-found for %s, without reading the backend', async (_label, tenantId) => {
    await expect(render(tenantId)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getTenant).not.toHaveBeenCalled();
  });

  it.each([
    ['lower case', INSTITUTION],
    ['upper case', INSTITUTION.toUpperCase()],
  ])('reads an institution id in %s', async (_label, tenantId) => {
    await Promise.resolve(render(tenantId)).catch(() => undefined);
    expect(getTenant).toHaveBeenCalledWith(tenantId);
  });
});
