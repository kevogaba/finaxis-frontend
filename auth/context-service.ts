import 'server-only';
import { z } from 'zod';
import { backendApi } from '@/auth/backend-api';
import { readContextToken } from '@/auth/context-cookie';
import type { FinaxisUser } from '@/auth/auth.types';
import {
  resolveApplicationContextModule,
  type ApplicationContext,
} from '@/config/application-context';
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
      reason: 'missing-context-token' | 'profile-has-no-selected-branch' | 'profile-request-failed';
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

async function requireContextToken(headers: Headers): Promise<string> {
  const contextToken = await readContextToken(headers);
  if (!contextToken) {
    throw new ContextTokenMissingError();
  }

  return contextToken;
}

export async function discoverOrganisations(
  headers: Headers,
  page = DEFAULT_DISCOVERY_PAGE,
): Promise<Page<BackendOrganisation>> {
  const discoveryPage = validateDiscoveryPage(page);
  return backendApi.get<Page<BackendOrganisation>>(
    `/api/v1/auth/organisations?page=${discoveryPage}&size=${DISCOVERY_PAGE_SIZE}`,
    headers,
  );
}

export async function selectOrganisation(
  headers: Headers,
  organisationId: string,
): Promise<SelectOrganisationResponse> {
  return backendApi.post<SelectOrganisationResponse>(
    '/api/v1/auth/select-organisation',
    { organisation_id: validateOrganisationId(organisationId) },
    headers,
  );
}

export async function discoverBranches(
  headers: Headers,
  page = DEFAULT_DISCOVERY_PAGE,
): Promise<Page<BackendBranch>> {
  const discoveryPage = validateDiscoveryPage(page);
  return backendApi.get<Page<BackendBranch>>(
    `/api/v1/auth/branches?page=${discoveryPage}&size=${DISCOVERY_PAGE_SIZE}`,
    headers,
    await requireContextToken(headers),
  );
}

export async function selectBranch(
  headers: Headers,
  branchId: string,
): Promise<SelectBranchResponse> {
  return backendApi.post<SelectBranchResponse>(
    '/api/v1/auth/select-branch',
    { branch_id: validateBranchId(branchId) },
    headers,
    await requireContextToken(headers),
  );
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

/**
 * Resolves the only context that is safe to pass to the authenticated shell.
 * The signed context token stays in the HttpOnly cookie and is never returned
 * from this server-only boundary.
 */
export async function getSelectedContextProfile(headers: Headers): Promise<SelectedContextProfile> {
  const contextToken = await readContextToken(headers);
  if (!contextToken) {
    return { kind: 'redirect-to-context-selection', reason: 'missing-context-token' };
  }

  let profile: BackendProfile;
  try {
    profile = await backendApi.get<BackendProfile>('/api/v1/auth/me', headers, contextToken);
  } catch {
    return { kind: 'redirect-to-context-selection', reason: 'profile-request-failed' };
  }

  if (!profile.organisation || !profile.selected_branch) {
    return {
      kind: 'redirect-to-context-selection',
      reason: 'profile-has-no-selected-branch',
    };
  }

  return {
    kind: 'resolved',
    profile,
    context: {
      module: resolveApplicationContextModule(profile.organisation.id),
      organization: { id: profile.organisation.id, name: profile.organisation.name },
      branch: { id: profile.selected_branch.id, name: profile.selected_branch.name },
    },
  };
}
