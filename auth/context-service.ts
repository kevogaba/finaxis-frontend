import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { z } from 'zod';
import { BackendApiError, backendApi } from '@/auth/backend-api';
import { readContextToken } from '@/auth/context-cookie';
import type { FinaxisUser } from '@/auth/auth.types';
import {
  resolveApplicationContextModule,
  type ApplicationContext,
} from '@/config/application-context';
import {
  branchPageSchema,
  organisationPageSchema,
  profileSchema,
  selectBranchResponseSchema,
  selectOrganisationResponseSchema,
} from '@/auth/context-contract';
import type {
  BackendBranch,
  BackendOrganisation,
  BackendProfile,
  Page,
  SelectBranchResponse,
  SelectOrganisationResponse,
} from '@/auth/context.types';

const DEFAULT_DISCOVERY_PAGE = 0;
const DISCOVERY_PAGE_SIZE = 25;
const discoveryPageSchema = z.number().int().min(0);
const uuidSyntax = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const organisationIdSchema = z.string().regex(uuidSyntax);
const branchIdSchema = z.string().regex(uuidSyntax);

export type SelectedContextProfile =
  | {
      kind: 'resolved';
      profile: BackendProfile;
      context: ApplicationContext;
    }
  | {
      kind: 'redirect-to-context-selection';
      reason: 'missing-context-token' | 'invalid-context';
    };

export class ContextTokenMissingError extends Error {
  constructor() {
    super('A context token is required.');
    this.name = 'ContextTokenMissingError';
  }
}

function validateOrganisationId(organisationId: string): string {
  return organisationIdSchema.parse(organisationId);
}

function validateBranchId(branchId: string): string {
  return branchIdSchema.parse(branchId);
}

function validateDiscoveryPage(page: number): number {
  return discoveryPageSchema.parse(page);
}

export function parseDiscoveryPageQuery(
  value: string | string[] | null | undefined,
): number | null {
  const firstValue = Array.isArray(value) ? value[0] : value;
  if (firstValue === null || firstValue === undefined || firstValue === '') {
    return DEFAULT_DISCOVERY_PAGE;
  }
  if (!/^\d+$/.test(firstValue)) {
    return null;
  }

  const parsedPage = Number.parseInt(firstValue, 10);
  const parsed = discoveryPageSchema.safeParse(parsedPage);
  return parsed.success ? parsed.data : null;
}

async function requireContextToken(requestHeaders: Headers): Promise<string> {
  const contextToken = await readContextToken(requestHeaders);
  if (!contextToken) {
    throw new ContextTokenMissingError();
  }

  return contextToken;
}

export async function discoverOrganisations(
  requestHeaders: Headers,
  page = DEFAULT_DISCOVERY_PAGE,
): Promise<Page<BackendOrganisation>> {
  const discoveryPage = validateDiscoveryPage(page);
  const raw = await backendApi.get<unknown>(
    `/api/v1/auth/organisations?page=${discoveryPage}&size=${DISCOVERY_PAGE_SIZE}`,
    requestHeaders,
  );
  return organisationPageSchema.parse(raw);
}

export async function selectOrganisation(
  requestHeaders: Headers,
  organisationId: string,
): Promise<SelectOrganisationResponse> {
  const raw = await backendApi.post<unknown>(
    '/api/v1/auth/select-organisation',
    { organisation_id: validateOrganisationId(organisationId) },
    requestHeaders,
  );
  return selectOrganisationResponseSchema.parse(raw);
}

export async function discoverBranches(
  requestHeaders: Headers,
  page = DEFAULT_DISCOVERY_PAGE,
): Promise<Page<BackendBranch>> {
  const discoveryPage = validateDiscoveryPage(page);
  const raw = await backendApi.get<unknown>(
    `/api/v1/auth/branches?page=${discoveryPage}&size=${DISCOVERY_PAGE_SIZE}`,
    requestHeaders,
    await requireContextToken(requestHeaders),
  );
  return branchPageSchema.parse(raw);
}

export async function selectBranch(
  requestHeaders: Headers,
  branchId: string,
): Promise<SelectBranchResponse> {
  const raw = await backendApi.post<unknown>(
    '/api/v1/auth/select-branch',
    { branch_id: validateBranchId(branchId) },
    requestHeaders,
    await requireContextToken(requestHeaders),
  );
  return selectBranchResponseSchema.parse(raw);
}

export function profileToFinaxisUser(
  profile: BackendProfile,
  fallbackUser?: FinaxisUser,
): FinaxisUser {
  const email = profile.email ?? fallbackUser?.email ?? '';
  const fullName = profile.full_name?.trim();
  let name = fallbackUser?.name ?? 'Finaxis user';
  if (email) {
    name = email;
  }
  if (fullName) {
    name = fullName;
  }

  return {
    branches: profile.branches.map((branch) => ({ id: branch.id, name: branch.name })),
    email,
    id: profile.user_id,
    image: fallbackUser?.image,
    name,
    organization: profile.organisation
      ? { id: profile.organisation.id, name: profile.organisation.name }
      : undefined,
    permissions: profile.permissions,
    roles: profile.roles.map((role) => role.code),
    selectedBranch: profile.selected_branch
      ? { id: profile.selected_branch.id, name: profile.selected_branch.name }
      : undefined,
    username: fallbackUser?.username,
  };
}

function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof BackendApiError &&
    (error.status === 401 || error.code === 'invalid_active_tenant_context')
  );
}

/**
 * Resolves the only context that is safe to pass to the authenticated shell. The signed context
 * token stays in the HttpOnly cookie. A 401 (expired session) or `invalid_active_tenant_context`
 * (stale or revoked context) sends the user back through context selection; any other failure —
 * another 403 such as `forbidden` for a role without `iam.profile.read`, a backend outage, or a
 * response that no longer matches the contract — throws to the error boundary rather than looping.
 */
export async function getSelectedContextProfile(
  requestHeaders: Headers,
): Promise<SelectedContextProfile> {
  const contextToken = await readContextToken(requestHeaders);
  if (!contextToken) {
    return { kind: 'redirect-to-context-selection', reason: 'missing-context-token' };
  }

  let raw: unknown;
  try {
    raw = await backendApi.get<unknown>('/api/v1/auth/me', requestHeaders, contextToken);
  } catch (error) {
    if (isAuthFailure(error)) {
      return { kind: 'redirect-to-context-selection', reason: 'invalid-context' };
    }
    throw error;
  }

  const profile = profileSchema.parse(raw);
  if (!profile.organisation) {
    return { kind: 'redirect-to-context-selection', reason: 'invalid-context' };
  }

  return {
    kind: 'resolved',
    profile,
    context: {
      module: resolveApplicationContextModule(profile.organisation.id),
      organization: { id: profile.organisation.id, name: profile.organisation.name },
      branch: profile.selected_branch
        ? { id: profile.selected_branch.id, name: profile.selected_branch.name }
        : null,
    },
  };
}

/** Per-request memoized profile for Server Components (one `/auth/me` call per render). */
export const getCurrentContextProfile = cache(async (): Promise<SelectedContextProfile> =>
  getSelectedContextProfile(await headers()),
);
