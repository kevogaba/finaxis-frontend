import 'server-only';
import type { FinaxisUser } from '@/auth/auth.types';
import type {
  BackendBranch,
  BackendOrganisation,
  BackendProfile,
  Page,
  SelectBranchResponse,
  SelectOrganisationResponse,
} from '@/auth/context.types';

export const E2E_SESSION_COOKIE_NAME = 'finaxis.session_token';
export const E2E_SESSION_COOKIE_VALUE = 'e2e-authenticated-session';
export const E2E_SCENARIO_COOKIE_NAME = 'finaxis_e2e_scenario';

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const ORGANISATION_CONTEXT_TOKEN = 'e2e-organisation-context-token';
const BRANCH_CONTEXT_TOKEN = 'e2e-branch-context-token';

type E2eScenario = 'default' | 'empty-organisations' | 'selection-forbidden';

export type E2eBackendResult<T> =
  { kind: 'unhandled' } | { kind: 'success'; body: T } | { kind: 'error'; status: number };

export interface E2eBetterAuthSession {
  session: {
    createdAt: Date;
    expiresAt: Date;
    id: string;
    token: string;
    updatedAt: Date;
    userId: string;
  };
  user: {
    createdAt: Date;
    email: string;
    emailVerified: boolean;
    id: string;
    image: string | null;
    name: string;
    updatedAt: Date;
  };
}

function isE2eTestMode(): boolean {
  return process.env.FINAXIS_E2E_TEST_MODE === '1' && process.env.NODE_ENV !== 'production';
}

function cookieValue(headers: Headers, name: string): string | null {
  const cookieHeader = headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(';')
    .map((value) => value.trim())
    .find((value) => {
      const separator = value.indexOf('=');
      return separator > 0 && value.slice(0, separator) === name;
    });

  if (!cookie) {
    return null;
  }

  try {
    return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  } catch {
    return null;
  }
}

function hasE2eSession(headers: Headers): boolean {
  return cookieValue(headers, E2E_SESSION_COOKIE_NAME) === E2E_SESSION_COOKIE_VALUE;
}

function e2eScenario(headers: Headers): E2eScenario {
  const scenario = cookieValue(headers, E2E_SCENARIO_COOKIE_NAME);
  if (scenario === 'empty-organisations' || scenario === 'selection-forbidden') {
    return scenario;
  }

  return 'default';
}

function page<T>(items: readonly T[]): Page<T> {
  return {
    items,
    page: {
      has_next: false,
      has_previous: false,
      number: 0,
      size: 25,
      total_items: items.length,
      total_pages: items.length > 0 ? 1 : 0,
    },
  };
}

const organisation: BackendOrganisation = {
  display_name: 'Greenfield SACCO',
  membership_id: MEMBERSHIP_ID,
  membership_status: 'ACTIVE',
  organisation_id: ORGANISATION_ID,
  organisation_status: 'ACTIVE',
  tenant_code: 'GREEN',
};

const branch: BackendBranch = {
  branch_code: 'HQ',
  branch_id: BRANCH_ID,
  branch_name: 'Head Office',
  branch_status: 'ACTIVE',
};

const profile: BackendProfile = {
  branches: [
    {
      code: branch.branch_code,
      id: branch.branch_id,
      name: branch.branch_name,
      status: branch.branch_status,
    },
    {
      code: 'WEST',
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Westlands Branch',
      status: 'ACTIVE',
    },
  ],
  email: 'backend.jane@greenfield.example',
  full_name: 'Backend Jane Manager',
  keycloak_subject: 'e2e-keycloak-subject',
  membership: {
    id: MEMBERSHIP_ID,
    status: 'ACTIVE',
  },
  organisation: {
    code: organisation.tenant_code,
    id: ORGANISATION_ID,
    name: organisation.display_name,
    status: organisation.organisation_status,
  },
  permissions: ['users.read', 'branches.read'],
  roles: [
    {
      code: 'admin',
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Administrator',
      status: 'ACTIVE',
    },
  ],
  selected_branch: {
    code: branch.branch_code,
    id: branch.branch_id,
    name: branch.branch_name,
    status: branch.branch_status,
  },
  user_id: 'e2e-backend-user',
};

const PLATFORM_TENANT_ID = '99999999-9999-4999-8999-999999999999';

const platformTenant = {
  base_currency_code: 'KES',
  bootstrap_failure_code: null,
  bootstrap_status: 'COMPLETE',
  country_code: 'KE',
  created_at: '2026-07-01T08:00:00.000Z',
  display_name: 'Acme SACCO',
  id: PLATFORM_TENANT_ID,
  status: 'ACTIVE',
  tenant_code: 'ACME',
  timezone: 'Africa/Nairobi',
  updated_at: '2026-07-24T08:00:00.000Z',
};

const platformAuditEvent = {
  action: 'UPDATE',
  actor_type: 'HUMAN',
  actor_user_id: 'e2e-backend-user',
  entity_id: PLATFORM_TENANT_ID,
  entity_type: 'TENANT',
  event_type: 'TENANT_UPDATED',
  id: 'e0000000-0000-4000-8000-000000000000',
  occurred_at: '2026-07-01T08:00:00.000Z',
  organisation_id: ORGANISATION_ID,
  outcome: 'SUCCESS',
  severity: 'INFO',
};

export function getE2eAuthenticatedUser(headers: Headers): FinaxisUser | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  return {
    branches: [],
    email: 'e2e.session@greenfield.example',
    id: 'e2e-session-user',
    name: 'E2E Session User',
    permissions: [],
    roles: [],
  };
}

export function getE2eAccessToken(headers: Headers): string | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  return 'e2e-server-only-access-token';
}

export function getE2eBetterAuthSession(headers: Headers): E2eBetterAuthSession | null {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return null;
  }

  const createdAt = new Date('2026-07-26T00:00:00.000Z');
  const expiresAt = new Date('2026-07-26T08:00:00.000Z');

  return {
    session: {
      createdAt,
      expiresAt,
      id: 'e2e-session-id',
      token: E2E_SESSION_COOKIE_VALUE,
      updatedAt: createdAt,
      userId: 'e2e-session-user',
    },
    user: {
      createdAt,
      email: 'e2e.session@greenfield.example',
      emailVerified: true,
      id: 'e2e-session-user',
      image: null,
      name: 'E2E Session User',
      updatedAt: createdAt,
    },
  };
}

export function getE2eBackendResult<T>(
  path: string,
  headers: Headers,
  init: RequestInit,
  contextToken?: string,
): E2eBackendResult<T> {
  if (!isE2eTestMode() || !hasE2eSession(headers)) {
    return { kind: 'unhandled' };
  }

  const method = init.method ?? 'GET';
  const pathname = path.split('?')[0];
  const scenario = e2eScenario(headers);

  if (method === 'GET' && pathname === '/api/v1/auth/organisations') {
    const body =
      scenario === 'empty-organisations'
        ? page<BackendOrganisation>([])
        : page<BackendOrganisation>([organisation]);
    return { body: body as T, kind: 'success' };
  }

  if (method === 'POST' && pathname === '/api/v1/auth/select-organisation') {
    if (scenario === 'selection-forbidden') {
      return { kind: 'error', status: 403 };
    }

    const body: SelectOrganisationResponse = {
      assigned_branch_ids: [BRANCH_ID],
      branch_id: null,
      context_header: 'X-Active-Organisation-Context',
      context_token: ORGANISATION_CONTEXT_TOKEN,
      membership_id: MEMBERSHIP_ID,
      organisation_id: ORGANISATION_ID,
      requires_branch_selection: true,
    };
    return { body: body as T, kind: 'success' };
  }

  if (method === 'GET' && pathname === '/api/v1/auth/branches') {
    if (contextToken !== ORGANISATION_CONTEXT_TOKEN) {
      return { kind: 'error', status: 409 };
    }

    return { body: page<BackendBranch>([branch]) as T, kind: 'success' };
  }

  if (method === 'POST' && pathname === '/api/v1/auth/select-branch') {
    if (contextToken !== ORGANISATION_CONTEXT_TOKEN) {
      return { kind: 'error', status: 409 };
    }

    const body: SelectBranchResponse = {
      branch_id: BRANCH_ID,
      context_header: 'X-Active-Organisation-Context',
      context_token: BRANCH_CONTEXT_TOKEN,
      membership_id: MEMBERSHIP_ID,
      organisation_id: ORGANISATION_ID,
    };
    return { body: body as T, kind: 'success' };
  }

  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    if (contextToken !== BRANCH_CONTEXT_TOKEN) {
      return { kind: 'error', status: 403 };
    }

    return { body: profile as T, kind: 'success' };
  }

  if (method === 'GET' && pathname === '/api/v1/platform/tenants') {
    if (contextToken !== BRANCH_CONTEXT_TOKEN) {
      return { kind: 'error', status: 403 };
    }

    return { body: page([platformTenant]) as T, kind: 'success' };
  }

  if (method === 'GET' && pathname === `/api/v1/platform/tenants/${PLATFORM_TENANT_ID}`) {
    if (contextToken !== BRANCH_CONTEXT_TOKEN) {
      return { kind: 'error', status: 403 };
    }

    return { body: platformTenant as T, kind: 'success' };
  }

  if (method === 'GET' && pathname?.startsWith('/api/v1/platform/tenants/')) {
    if (contextToken !== BRANCH_CONTEXT_TOKEN) {
      return { kind: 'error', status: 403 };
    }

    return { kind: 'error', status: 404 };
  }

  if (method === 'GET' && pathname === '/api/v1/tenant/audit-events') {
    if (contextToken !== BRANCH_CONTEXT_TOKEN) {
      return { kind: 'error', status: 403 };
    }

    return { body: page([platformAuditEvent]) as T, kind: 'success' };
  }

  return { kind: 'unhandled' };
}
