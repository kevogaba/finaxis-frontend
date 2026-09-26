'use client';

import { useEffect, useRef } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import { PaginationControls } from './pagination-controls';
import {
  ORGANISATION_DISCOVERY_ERROR,
  useContextSelection,
  type SelectionOutcome,
} from './use-context-selection';

const ALL_BRANCHES_VALUE = '__all__';

interface ContextSelectionFormProps {
  initialOrganisations: BrowserPage<BrowserOrganisation>;
  hasOrganisationLoadError?: boolean;
  onComplete: (outcome: SelectionOutcome) => void;
  onOrganisationCommitted?: (organisationId: string) => void;
  onSessionExpired: () => void;
  onOrganisationLost?: () => void;
}

export function ContextSelectionForm(props: ContextSelectionFormProps) {
  const selection = useContextSelection(props);
  const { branchPage } = selection;
  const hasNoOrganisations = selection.organisationPage.items.length === 0;
  const canChooseOrganisation = !selection.organisationError && !hasNoOrganisations;
  const hasLoadedBranches = branchPage !== null;
  const hasNoBranches = hasLoadedBranches && branchPage.items.length === 0;
  const showBranchSelect = hasLoadedBranches && !hasNoBranches;

  // jsx-a11y/no-autofocus (this ESLint config's `strict` preset) rejects a literal `autoFocus`
  // prop; move focus imperatively instead, once, the first time the Branch step appears.
  const branchSelectRef = useRef<{ focus: () => void } | null>(null);
  const hasFocusedBranchSelect = useRef(false);
  useEffect(() => {
    if (showBranchSelect && !hasFocusedBranchSelect.current) {
      branchSelectRef.current?.focus();
      hasFocusedBranchSelect.current = true;
    }
    if (!showBranchSelect) {
      hasFocusedBranchSelect.current = false;
    }
  }, [showBranchSelect]);

  return (
    <>
      {selection.organisationError && (
        <Alert
          action={
            <Button
              color="inherit"
              onClick={() =>
                void selection.loadOrganisations(selection.lastOrganisationPageRequest)
              }
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

      {!selection.organisationError && hasNoOrganisations && (
        <Alert severity="info" variant="outlined">
          No organisations are available for your account. Contact an administrator if you need
          access.
        </Alert>
      )}

      {canChooseOrganisation && (
        <FormControl fullWidth disabled={selection.isMutating || selection.isDiscoveryLoading}>
          <InputLabel id="organisation-label">Organisation</InputLabel>
          <Select
            label="Organisation"
            labelId="organisation-label"
            onChange={(event) => {
              void selection.selectOrganisation(event.target.value);
            }}
            value={selection.organisationId}
          >
            {selection.organisationPage.items.map((organisation) => (
              <MenuItem key={organisation.organisationId} value={organisation.organisationId}>
                {organisation.displayName} ({organisation.tenantCode})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {!selection.organisationError && (
        <PaginationControls
          ariaLabel="Organisation pages"
          disabled={selection.isMutating || selection.isDiscoveryLoading}
          onPageChange={(page) => void selection.loadOrganisations(page)}
          page={selection.organisationPage.page}
        />
      )}

      {selection.isLoadingOrganisations && (
        <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress aria-hidden="true" size={18} />
          <Typography variant="body2">Loading organisations…</Typography>
        </Stack>
      )}

      {selection.updateError && (
        <Alert role="alert" severity="error" variant="outlined">
          {selection.updateError}
        </Alert>
      )}

      {selection.isSavingOrganisation && (
        <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress aria-hidden="true" size={18} />
          <Typography variant="body2">Saving organisation…</Typography>
        </Stack>
      )}

      {selection.isLoadingBranches && (
        <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress aria-hidden="true" size={18} />
          <Typography variant="body2">Loading branches…</Typography>
        </Stack>
      )}

      {selection.branchError && (
        <Alert
          action={
            <Button
              color="inherit"
              onClick={() => void selection.loadBranches(selection.lastBranchPageRequest)}
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
          {selection.branchError}
        </Alert>
      )}

      {hasNoBranches && (
        <Alert severity="info" variant="outlined">
          No branches are available for this organisation. Contact an administrator if you need
          access.
        </Alert>
      )}

      {showBranchSelect && (
        <FormControl fullWidth disabled={selection.isMutating || selection.isDiscoveryLoading}>
          <InputLabel id="branch-label">Branch</InputLabel>
          <Select<string>
            label="Branch"
            labelId="branch-label"
            inputRef={branchSelectRef}
            onChange={(event) => {
              if (event.target.value === ALL_BRANCHES_VALUE) {
                selection.selectAllBranches();
                return;
              }
              void selection.selectBranch(event.target.value);
            }}
            value=""
          >
            <MenuItem value={ALL_BRANCHES_VALUE}>All branches (institution level)</MenuItem>
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
          disabled={selection.isMutating || selection.isDiscoveryLoading}
          onPageChange={(page) => void selection.loadBranches(page)}
          page={branchPage.page}
        />
      )}

      {selection.isSavingBranch && (
        <Stack direction="row" role="status" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress aria-hidden="true" size={18} />
          <Typography variant="body2">Saving branch…</Typography>
        </Stack>
      )}
    </>
  );
}
