'use client';

import { useState } from 'react';
import type {
  BrowserBranch,
  BrowserOrganisation,
  BrowserOrganisationSelection,
  BrowserPage,
} from '@/auth/context-browser-dto';
import {
  fetchBranches,
  fetchOrganisations,
  isContextLost,
  isSessionExpired,
  selectBranchRequest,
  selectOrganisationRequest,
} from './context-api';

const CONTEXT_UPDATE_ERROR = "We couldn't update your context. Please try again.";
const BRANCH_DISCOVERY_ERROR = "We couldn't load branches. Please try again.";
export const ORGANISATION_DISCOVERY_ERROR = "We couldn't load organisations. Please try again.";
const STALE_CONTEXT_MESSAGE =
  'Your saved context is no longer valid. Select an organisation again.';
const CONTEXT_ACCESS_DENIED_MESSAGE = 'You do not have access to this context.';

function contextLostMessage(error: { status: number }): string {
  return error.status === 403 ? CONTEXT_ACCESS_DENIED_MESSAGE : STALE_CONTEXT_MESSAGE;
}

export type SelectionOutcome =
  | { kind: 'branch'; organisationId: string; branchId: string }
  | { kind: 'institution'; organisationId: string };

type NextStep = 'done-branch' | 'done-institution' | { autoSelect: string } | 'choose-branch';

type OrganisationSelectionResponse = Pick<
  BrowserOrganisationSelection,
  'branchId' | 'requiresBranchSelection' | 'assignedBranchIds'
>;

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
  /** The organisation the caller is already pinned to (dialog-only): re-picking it re-lists its
   * branches instead of re-POSTing select-organisation, since the ambient token already covers it. */
  currentOrganisationId?: string;
  /** The branch, if any, `currentOrganisationId`'s token currently carries. */
  currentBranchId?: string | null;
  /** The backend cleared the context cookie server-side (a 403/409 from the branch endpoints); the
   * caller should stop treating `currentOrganisationId` as still pinned. */
  onOrganisationLost?: () => void;
}

export function useContextSelection({
  initialOrganisations,
  hasOrganisationLoadError = false,
  onComplete,
  onOrganisationCommitted,
  onSessionExpired,
  currentOrganisationId,
  currentBranchId = null,
  onOrganisationLost,
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
  const isCurrentOrganisation =
    currentOrganisationId !== undefined && organisationId === currentOrganisationId;
  const distinctLoadedBranches = branchPage
    ? new Set(branchPage.items.map((branch) => branch.branchId)).size
    : 0;
  // Outside the reselect-current-organisation mode this is always true (the branch step is only
  // ever reached there with 2+ distinct assigned branches); inside it, a page that turns out to
  // hold at most one distinct branch must not offer a no-op All branches (spec §6.5).
  const canOfferAllBranches = !isCurrentOrganisation || distinctLoadedBranches > 1;

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
      if (isContextLost(error)) {
        setOrganisationId('');
        setUpdateError(contextLostMessage(error));
        onOrganisationLost?.();
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
      if (isContextLost(error)) {
        setBranchPage(null);
        setOrganisationId('');
        setUpdateError(contextLostMessage(error));
        onOrganisationLost?.();
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
    if (nextOrganisationId === currentOrganisationId) {
      // The ambient token is already pinned to this organisation (there is no "unpin" endpoint),
      // so just re-list its branches instead of re-POSTing select-organisation — that also keeps
      // this well clear of the 20/min auth-selection rate limit.
      await loadBranches(0);
      return;
    }
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

  const selectAllBranches = async () => {
    if (!isCurrentOrganisation || currentBranchId === null) {
      // Either a freshly-committed organisation (already institution-level once its POST
      // succeeded) or this organisation already has no branch pinned: nothing to change
      // server-side.
      onComplete({ kind: 'institution', organisationId });
      return;
    }
    if (isMutating) {
      return;
    }
    setUpdateError(null);
    setIsSavingOrganisation(true);
    try {
      // Only a fresh select-organisation call clears a previously pinned branch — there is no
      // dedicated "unpin" endpoint.
      await selectOrganisationRequest(organisationId);
      onComplete({ kind: 'institution', organisationId });
    } catch (error) {
      if (isSessionExpired(error)) {
        onSessionExpired();
        return;
      }
      if (isContextLost(error)) {
        setOrganisationId('');
        setUpdateError(contextLostMessage(error));
        onOrganisationLost?.();
        return;
      }
      setOrganisationId('');
      setUpdateError(CONTEXT_UPDATE_ERROR);
    } finally {
      setIsSavingOrganisation(false);
    }
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
    canOfferAllBranches,
    loadOrganisations,
    loadBranches,
    selectOrganisation,
    selectBranch,
    selectAllBranches,
  };
}
