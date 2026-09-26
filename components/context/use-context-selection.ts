'use client';

import { useState } from 'react';
import type { BrowserBranch, BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import {
  fetchBranches,
  fetchOrganisations,
  isSessionExpired,
  isStaleContext,
  selectBranchRequest,
  selectOrganisationRequest,
  type OrganisationSelectionResponse,
} from './context-api';

export const CONTEXT_UPDATE_ERROR = "We couldn't update your context. Please try again.";
export const BRANCH_DISCOVERY_ERROR = "We couldn't load branches. Please try again.";
export const ORGANISATION_DISCOVERY_ERROR = "We couldn't load organisations. Please try again.";
export const STALE_CONTEXT_MESSAGE =
  'Your saved context is no longer valid. Select an organisation again.';

export type SelectionOutcome =
  | { kind: 'branch'; organisationId: string; branchId: string }
  | { kind: 'institution'; organisationId: string };

type NextStep = 'done-branch' | 'done-institution' | { autoSelect: string } | 'choose-branch';

/**
 * What to do after the organisation is committed (contract §C `SelectOrganisationResponse`): the
 * backend auto-selects a lone assignment row; duplicate rows for one branch make it ask anyway, so
 * a single distinct branch is pinned here; several distinct branches offer All branches.
 */
export function nextStepAfterOrganisation(selection: OrganisationSelectionResponse): NextStep {
  if (!selection.requiresBranchSelection) {
    return selection.branchId ? 'done-branch' : 'done-institution';
  }
  const distinct = [...new Set(selection.assignedBranchIds)];
  const [only] = distinct;
  return distinct.length === 1 && only !== undefined ? { autoSelect: only } : 'choose-branch';
}

interface UseContextSelectionOptions {
  initialOrganisations: BrowserPage<BrowserOrganisation>;
  hasOrganisationLoadError?: boolean;
  onComplete: (outcome: SelectionOutcome) => void;
  /** Called once the organisation is committed and a branch choice is still pending. */
  onOrganisationCommitted?: (organisationId: string) => void;
  onSessionExpired: () => void;
}

export function useContextSelection({
  initialOrganisations,
  hasOrganisationLoadError = false,
  onComplete,
  onOrganisationCommitted,
  onSessionExpired,
}: UseContextSelectionOptions) {
  const [organisationPage, setOrganisationPage] = useState(initialOrganisations);
  const [organisationId, setOrganisationId] = useState('');
  const [branchPage, setBranchPage] = useState<BrowserPage<BrowserBranch> | null>(null);
  const [lastOrganisationPageRequest, setLastOrganisationPageRequest] = useState(
    initialOrganisations.page.number,
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
      setOrganisationPage(await fetchOrganisations(page));
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
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
      setBranchPage(await fetchBranches(page));
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
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

  const selectBranch = async (
    branchId: string,
    forOrganisationId = organisationId,
  ): Promise<boolean> => {
    if (!branchId || isSavingBranch) {
      return false;
    }
    setUpdateError(null);
    setIsSavingBranch(true);
    try {
      await selectBranchRequest(branchId);
      onComplete({ kind: 'branch', organisationId: forOrganisationId, branchId });
      return true;
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return false;
      }
      if (isStaleContext(error)) {
        setBranchPage(null);
        setOrganisationId('');
        setUpdateError(STALE_CONTEXT_MESSAGE);
        return false;
      }
      setUpdateError(CONTEXT_UPDATE_ERROR);
      return false;
    } finally {
      setIsSavingBranch(false);
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
      const selection = await selectOrganisationRequest(nextOrganisationId);
      const step = nextStepAfterOrganisation(selection);
      setIsSavingOrganisation(false);
      if (step === 'done-branch' && selection.branchId) {
        onComplete({
          kind: 'branch',
          organisationId: nextOrganisationId,
          branchId: selection.branchId,
        });
        return;
      }
      if (step === 'done-institution') {
        onComplete({ kind: 'institution', organisationId: nextOrganisationId });
        return;
      }
      // The organisation token is already issued once the POST succeeds, so a branch step still
      // pending must commit it now: if the auto-pin below fails, or the user closes the dialog
      // before choosing a branch, they must land at All branches with the current organisation,
      // not a stale one (spec §6.5).
      onOrganisationCommitted?.(nextOrganisationId);
      if (typeof step === 'object') {
        // A failed auto-pin leaves no branch list, and MUI Select ignores re-picking its current
        // value, so clear the organisation choice: choosing it again retries the whole step.
        if (!(await selectBranch(step.autoSelect, nextOrganisationId))) {
          setOrganisationId('');
        }
        return;
      }
      await loadBranches(0);
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      setOrganisationId('');
      setUpdateError(CONTEXT_UPDATE_ERROR);
    } finally {
      setIsSavingOrganisation(false);
    }
  };

  const selectAllBranches = () => {
    onComplete({ kind: 'institution', organisationId });
  };

  return {
    organisationPage,
    organisationId,
    branchPage,
    lastOrganisationPageRequest,
    lastBranchPageRequest,
    isLoadingOrganisations,
    isSavingOrganisation,
    isLoadingBranches,
    isSavingBranch,
    isMutating,
    isDiscoveryLoading,
    organisationError,
    updateError,
    branchError,
    loadOrganisations,
    loadBranches,
    selectOrganisation,
    selectBranch,
    selectAllBranches,
  };
}
