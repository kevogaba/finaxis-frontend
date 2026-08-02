'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import type {
  BrowserBranch,
  BrowserOrganisation,
  BrowserPage,
  BrowserPageMetadata,
} from '@/auth/context-browser-dto';

const CONTEXT_UPDATE_ERROR = "We couldn't update your context. Please try again.";
const BRANCH_DISCOVERY_ERROR = "We couldn't load branches. Please try again.";
const ORGANISATION_DISCOVERY_ERROR = "We couldn't load organisations. Please try again.";
const STALE_CONTEXT_MESSAGE =
  'Your saved context is no longer valid. Select an organisation again.';
const SESSION_EXPIRED_REDIRECT = '/login?reason=session_expired';
const DEFAULT_DESTINATION = '/profile';

export type ContextSelectionDestination =
  | '/profile'
  | '/admin'
  | '/admin/audit'
  | '/admin/branches'
  | '/admin/roles'
  | '/admin/settings'
  | '/admin/users'
  | '/platform-admin'
  | '/platform-admin/tenants'
  | '/platform-admin/audit';

interface ContextSelectionPageProps {
  organisations: BrowserPage<BrowserOrganisation>;
  destination?: ContextSelectionDestination;
  hasOrganisationLoadError?: boolean;
}

interface OrganisationSelectionResponse {
  branchId: string | null;
  requiresBranchSelection: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOrganisationSelectionResponse(value: unknown): value is OrganisationSelectionResponse {
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

function isSessionExpired(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 401;
}

function isStaleContext(error: unknown): boolean {
  return error instanceof ContextRequestError && error.status === 409;
}

async function readSuccessfulJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new ContextRequestError(response.status);
  }

  return response.json() as Promise<unknown>;
}

interface PaginationControlsProps {
  ariaLabel: string;
  disabled: boolean;
  onPageChange: (page: number) => void;
  page: BrowserPageMetadata;
}

function PaginationControls({ ariaLabel, disabled, onPageChange, page }: PaginationControlsProps) {
  if (!page.hasNext && !page.hasPrevious) {
    return null;
  }

  return (
    <Stack
      aria-label={ariaLabel}
      component="nav"
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Button
        disabled={disabled || !page.hasPrevious}
        onClick={() => {
          onPageChange(page.number - 1);
        }}
        size="small"
        type="button"
        variant="outlined"
      >
        Previous
      </Button>
      <Typography color="text.secondary" variant="body2">
        Page {page.number + 1} of {Math.max(page.totalPages, 1)}
      </Typography>
      <Button
        disabled={disabled || !page.hasNext}
        onClick={() => {
          onPageChange(page.number + 1);
        }}
        size="small"
        type="button"
        variant="outlined"
      >
        Next
      </Button>
    </Stack>
  );
}

export function ContextSelectionPage({
  destination = DEFAULT_DESTINATION,
  organisations,
  hasOrganisationLoadError = false,
}: ContextSelectionPageProps) {
  const router = useRouter();
  const [organisationPage, setOrganisationPage] = useState(organisations);
  const [organisationId, setOrganisationId] = useState('');
  const [branchPage, setBranchPage] = useState<BrowserPage<BrowserBranch> | null>(null);
  const [lastOrganisationPageRequest, setLastOrganisationPageRequest] = useState(
    organisations.page.number,
  );
  const [lastBranchPageRequest, setLastBranchPageRequest] = useState(0);
  const [isLoadingOrganisations, setIsLoadingOrganisations] = useState(false);
  const [isSavingOrganisation, setIsSavingOrganisation] = useState(false);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [isSavingBranch, setIsSavingBranch] = useState(false);
  const [organisationError, setOrganisationError] = useState(hasOrganisationLoadError);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);

  const isMutating = isSavingOrganisation || isSavingBranch;
  const isDiscoveryLoading = isLoadingOrganisations || isLoadingBranches;

  const loadOrganisations = async (page: number) => {
    setLastOrganisationPageRequest(page);
    setIsLoadingOrganisations(true);
    setOrganisationError(false);
    setOrganisationId('');
    setBranchPage(null);
    setUpdateError(null);
    setBranchError(null);

    try {
      const response = await fetch(`/api/context/organisations?page=${page}`);
      const body = await readSuccessfulJson(response);
      if (!isBrowserPage(body, isBrowserOrganisation)) {
        throw new Error('Invalid organisation response.');
      }
      setOrganisationPage(body);
    } catch (error) {
      if (isSessionExpired(error)) {
        router.replace(SESSION_EXPIRED_REDIRECT);
        return;
      }
      setOrganisationError(true);
    } finally {
      setIsLoadingOrganisations(false);
    }
  };

  const loadBranches = async (page = 0) => {
    setLastBranchPageRequest(page);
    setIsLoadingBranches(true);
    setBranchError(null);

    try {
      const response = await fetch(`/api/context/branches?page=${page}`);
      const body = await readSuccessfulJson(response);
      if (!isBrowserPage(body, isBrowserBranch)) {
        throw new Error('Invalid branch response.');
      }
      setBranchPage(body);
    } catch (error) {
      if (isSessionExpired(error)) {
        router.replace(SESSION_EXPIRED_REDIRECT);
        return;
      }
      setBranchPage(null);
      if (isStaleContext(error)) {
        setOrganisationId('');
        setUpdateError(STALE_CONTEXT_MESSAGE);
        return;
      }
      setBranchError(BRANCH_DISCOVERY_ERROR);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const selectOrganisation = async (nextOrganisationId: string) => {
    if (!nextOrganisationId || isMutating) {
      return;
    }

    setOrganisationId(nextOrganisationId);
    setBranchPage(null);
    setUpdateError(null);
    setBranchError(null);
    setIsSavingOrganisation(true);

    try {
      const response = await fetch('/api/context/organisation', {
        body: JSON.stringify({ organisation_id: nextOrganisationId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const body = await readSuccessfulJson(response);
      if (!isOrganisationSelectionResponse(body)) {
        throw new Error('Invalid organisation selection response.');
      }

      if (!body.requiresBranchSelection && body.branchId) {
        router.replace(destination);
        return;
      }

      setIsSavingOrganisation(false);
      await loadBranches(0);
    } catch (error) {
      if (isSessionExpired(error)) {
        router.replace(SESSION_EXPIRED_REDIRECT);
        return;
      }
      setUpdateError(CONTEXT_UPDATE_ERROR);
    } finally {
      setIsSavingOrganisation(false);
    }
  };

  const selectBranch = async (nextBranchId: string) => {
    if (!nextBranchId || isMutating) {
      return;
    }

    setUpdateError(null);
    setIsSavingBranch(true);

    try {
      const response = await fetch('/api/context/branch', {
        body: JSON.stringify({ branch_id: nextBranchId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      await readSuccessfulJson(response);
      router.replace(destination);
    } catch (error) {
      if (isSessionExpired(error)) {
        router.replace(SESSION_EXPIRED_REDIRECT);
        return;
      }
      if (isStaleContext(error)) {
        setBranchPage(null);
        setOrganisationId('');
        setUpdateError(STALE_CONTEXT_MESSAGE);
        return;
      }
      setUpdateError(CONTEXT_UPDATE_ERROR);
    } finally {
      setIsSavingBranch(false);
    }
  };

  const hasNoOrganisations = organisationPage.items.length === 0;
  const canChooseOrganisation = !organisationError && !hasNoOrganisations;
  const hasLoadedBranches = branchPage !== null;
  const hasNoBranches = hasLoadedBranches && branchPage.items.length === 0;

  return (
    <Box
      component="main"
      className="flex min-h-dvh items-center justify-center p-4"
      sx={{ bgcolor: 'background.default' }}
    >
      <Paper
        component="section"
        variant="outlined"
        sx={{ maxWidth: 560, p: { xs: 3, sm: 4 }, width: '100%' }}
      >
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Select your context
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Choose the organisation and branch you want to work in.
            </Typography>
          </Box>

          {organisationError && (
            <Alert
              action={
                <Button
                  color="inherit"
                  onClick={() => void loadOrganisations(lastOrganisationPageRequest)}
                  size="small"
                  type="button"
                >
                  Try again
                </Button>
              }
              severity="error"
              variant="outlined"
            >
              {ORGANISATION_DISCOVERY_ERROR}
            </Alert>
          )}

          {!organisationError && hasNoOrganisations && (
            <Alert severity="info" variant="outlined">
              No organisations are available for your account. Contact an administrator if you need
              access.
            </Alert>
          )}

          {canChooseOrganisation && (
            <FormControl fullWidth disabled={isMutating || isDiscoveryLoading}>
              <InputLabel id="organisation-label">Organisation</InputLabel>
              <Select
                label="Organisation"
                labelId="organisation-label"
                onChange={(event) => {
                  void selectOrganisation(event.target.value);
                }}
                value={organisationId}
              >
                {organisationPage.items.map((organisation) => (
                  <MenuItem key={organisation.organisationId} value={organisation.organisationId}>
                    {organisation.displayName} ({organisation.tenantCode})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {!organisationError && (
            <PaginationControls
              ariaLabel="Organisation pages"
              disabled={isMutating || isDiscoveryLoading}
              onPageChange={(page) => void loadOrganisations(page)}
              page={organisationPage.page}
            />
          )}

          {isLoadingOrganisations && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Loading organisations…</Typography>
            </Stack>
          )}

          {updateError && (
            <Alert role="alert" severity="error" variant="outlined">
              {updateError}
            </Alert>
          )}

          {isSavingOrganisation && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Saving organisation…</Typography>
            </Stack>
          )}

          {isLoadingBranches && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Loading branches…</Typography>
            </Stack>
          )}

          {branchError && (
            <Alert
              action={
                <Button
                  color="inherit"
                  onClick={() => void loadBranches(lastBranchPageRequest)}
                  size="small"
                  type="button"
                >
                  Try again
                </Button>
              }
              role="alert"
              severity="error"
              variant="outlined"
            >
              {branchError}
            </Alert>
          )}

          {hasNoBranches && (
            <Alert severity="info" variant="outlined">
              No branches are available for this organisation. Contact an administrator if you need
              access.
            </Alert>
          )}

          {hasLoadedBranches && !hasNoBranches && (
            <FormControl fullWidth disabled={isMutating || isDiscoveryLoading}>
              <InputLabel id="branch-label">Branch</InputLabel>
              <Select
                label="Branch"
                labelId="branch-label"
                onChange={(event) => {
                  void selectBranch(event.target.value);
                }}
                value=""
              >
                {branchPage.items.map((branch) => (
                  <MenuItem key={branch.branchId} value={branch.branchId}>
                    {branch.branchName} ({branch.branchCode})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {hasLoadedBranches && (
            <PaginationControls
              ariaLabel="Branch pages"
              disabled={isMutating || isDiscoveryLoading}
              onPageChange={(page) => void loadBranches(page)}
              page={branchPage.page}
            />
          )}

          {isSavingBranch && (
            <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress aria-hidden="true" size={18} />
              <Typography variant="body2">Saving branch…</Typography>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
