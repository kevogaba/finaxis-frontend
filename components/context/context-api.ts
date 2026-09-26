import type {
  BrowserBranch,
  BrowserOrganisation,
  BrowserPage,
  BrowserPageMetadata,
} from '@/auth/context-browser-dto';

export interface OrganisationSelectionResponse {
  branchId: string | null;
  requiresBranchSelection: boolean;
  /** De-duplicated server-side; older fixtures may omit it. */
  assignedBranchIds: readonly string[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isOrganisationSelectionResponse(
  value: unknown,
): value is OrganisationSelectionResponse {
  return (
    isRecord(value) &&
    typeof value.requiresBranchSelection === 'boolean' &&
    (typeof value.branchId === 'string' || value.branchId === null)
  );
}

export function isBrowserBranch(value: unknown): value is BrowserBranch {
  return (
    isRecord(value) &&
    typeof value.branchId === 'string' &&
    typeof value.branchCode === 'string' &&
    typeof value.branchName === 'string' &&
    typeof value.branchStatus === 'string'
  );
}

function isBrowserPageMetadata(value: unknown): value is BrowserPageMetadata {
  return (
    isRecord(value) &&
    typeof value.hasNext === 'boolean' &&
    typeof value.hasPrevious === 'boolean' &&
    typeof value.number === 'number' &&
    typeof value.size === 'number' &&
    typeof value.totalItems === 'number' &&
    typeof value.totalPages === 'number'
  );
}

export function isBrowserOrganisation(value: unknown): value is BrowserOrganisation {
  return (
    isRecord(value) &&
    typeof value.displayName === 'string' &&
    typeof value.membershipId === 'string' &&
    typeof value.membershipStatus === 'string' &&
    typeof value.organisationId === 'string' &&
    typeof value.organisationStatus === 'string' &&
    typeof value.tenantCode === 'string'
  );
}

export function isBrowserPage<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is BrowserPage<T> {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isItem) &&
    isBrowserPageMetadata(value.page)
  );
}

export class ContextRequestError extends Error {
  constructor(readonly status: number) {
    super(`Context request failed with status ${status}.`);
    this.name = 'ContextRequestError';
  }
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 401;
}

export function isStaleContext(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 409;
}

export async function readSuccessfulJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new ContextRequestError(response.status);
  }

  return response.json() as Promise<unknown>;
}

export async function fetchOrganisations(page: number): Promise<BrowserPage<BrowserOrganisation>> {
  const body = await readSuccessfulJson(await fetch(`/api/context/organisations?page=${page}`));
  if (!isBrowserPage(body, isBrowserOrganisation)) {
    throw new Error('Invalid organisation response.');
  }
  return body;
}

export async function fetchBranches(page: number): Promise<BrowserPage<BrowserBranch>> {
  const body = await readSuccessfulJson(await fetch(`/api/context/branches?page=${page}`));
  if (!isBrowserPage(body, isBrowserBranch)) {
    throw new Error('Invalid branch response.');
  }
  return body;
}

export async function selectOrganisationRequest(
  organisationId: string,
): Promise<OrganisationSelectionResponse> {
  const body = await readSuccessfulJson(
    await fetch('/api/context/organisation', {
      body: JSON.stringify({ organisation_id: organisationId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }),
  );
  if (!isOrganisationSelectionResponse(body)) {
    throw new Error('Invalid organisation selection response.');
  }
  const assigned =
    isRecord(body) && Array.isArray(body.assignedBranchIds) ? body.assignedBranchIds : [];
  return {
    branchId: body.branchId,
    requiresBranchSelection: body.requiresBranchSelection,
    assignedBranchIds: assigned.filter((id): id is string => typeof id === 'string'),
  };
}

export async function selectBranchRequest(branchId: string): Promise<void> {
  await readSuccessfulJson(
    await fetch('/api/context/branch', {
      body: JSON.stringify({ branch_id: branchId }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }),
  );
}
