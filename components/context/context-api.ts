import type {
  BrowserBranch,
  BrowserOrganisation,
  BrowserOrganisationSelection,
  BrowserPage,
  BrowserPageMetadata,
} from '@/auth/context-browser-dto';

type OrganisationSelectionResponse = Pick<
  BrowserOrganisationSelection,
  'branchId' | 'requiresBranchSelection' | 'assignedBranchIds'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Narrows only the fields this module actually reads off the raw body — see the defensive parse
 * of `assignedBranchIds` below, which isn't part of this shape. */
function hasOrganisationSelectionShape(
  value: unknown,
): value is Record<string, unknown> &
  Pick<BrowserOrganisationSelection, 'branchId' | 'requiresBranchSelection'> {
  return (
    isRecord(value) &&
    typeof value.requiresBranchSelection === 'boolean' &&
    (typeof value.branchId === 'string' || value.branchId === null)
  );
}

function isBrowserBranch(value: unknown): value is BrowserBranch {
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

function isBrowserOrganisation(value: unknown): value is BrowserOrganisation {
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

function isBrowserPage<T>(
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

class ContextRequestError extends Error {
  constructor(readonly status: number) {
    super(`Context request failed with status ${status}.`);
    this.name = 'ContextRequestError';
  }
}

export function isSessionExpired(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 401;
}

/**
 * The backend clears the context cookie server-side on a 403 (`invalid_active_tenant_context` or
 * `forbidden`) or a 409 (already gone) from the branch endpoints — either way there is no context
 * left to retry against without re-selecting an organisation.
 */
export function isContextLost(error: unknown): error is ContextRequestError {
  return error instanceof ContextRequestError && (error.status === 403 || error.status === 409);
}

async function readSuccessfulJson(response: Response): Promise<unknown> {
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
  if (!hasOrganisationSelectionShape(body)) {
    throw new Error('Invalid organisation selection response.');
  }
  // Defensive parse: assignedBranchIds isn't part of the narrowed shape above, so validate it here.
  const assigned = Array.isArray(body.assignedBranchIds) ? body.assignedBranchIds : [];
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
