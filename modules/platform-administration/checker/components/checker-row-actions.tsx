'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import { useToast } from '@/components/providers/toast-provider';
import type { ActionResult, FormAction } from '@/lib/api/action-result';
import {
  ACTIVATED_TOAST,
  APPROVED_TOAST,
  decisionCopy,
  type ApprovalOutcome,
} from '@/modules/administration/approvals/approval-copy';
import { sendBackCopy } from '@/modules/administration/branches/branch-rules';
import {
  activateInstitutionBranch,
  approveAsPlatformChecker,
  returnInstitutionBranch,
  submitInstitutionBranch,
} from '../checker-actions';
import { CHECKER_AUDIT_NOTE, type CheckerBranchAction } from '../checker-rules';

/** A row's buttons, wrapping under each other in a narrow cell, the caption under them. */
const ROW_SX = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 1,
  maxWidth: 240,
} as const;

/** Visible text, not a tooltip: a disabled button can't take focus to reveal one. */
function Caption({ id, text }: { id: string; text: string }) {
  return (
    <Typography
      id={id}
      variant="caption"
      sx={{ color: 'text.secondary', flexBasis: '100%', textWrap: 'pretty' }}
    >
      {text}
    </Typography>
  );
}

/** A successful decision removes this row's actions (`refresh()`), unmounting the component, so the
 * record title takes focus from the cleanup (10's pattern), never `<body>`. */
function useFocusTitleOnUnmount() {
  const succeededRef = useRef(false);
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);
  return succeededRef;
}

interface MemberApproveButtonProps {
  tenantId: string;
  membershipId: string;
  name: string;
  /** Why the platform would refuse this caller (`memberApproval`): shown disabled with it. */
  blocked: string | null;
  /** I2: the organisation the page rendered for; forwarded to `ReasonDialog` as a hidden field. */
  contextOrganisationId?: string;
}

/** A pending member's Approve on the institution's Users tab, as the platform checker (BG-02). */
export function MemberApproveButton({
  tenantId,
  membershipId,
  name,
  blocked,
  contextOrganisationId,
}: MemberApproveButtonProps) {
  const notify = useToast();
  const captionId = useId();
  const [open, setOpen] = useState(false);
  const succeededRef = useFocusTitleOnUnmount();
  // Ruling 10: the approval's echo says which way it went; the wrapper keeps it for the toast.
  const outcomeRef = useRef<ApprovalOutcome>('recorded');
  const approve = async (previous: ActionResult | null, formData: FormData) => {
    const result = await approveAsPlatformChecker(previous, formData);
    if (result.ok) outcomeRef.current = result.outcome;
    return result;
  };
  const copy = decisionCopy('approve', name);

  return (
    <Box sx={ROW_SX}>
      <Button
        size="small"
        variant="contained"
        aria-label={`Approve ${name}`}
        disabled={blocked !== null}
        aria-describedby={blocked === null ? undefined : captionId}
        onClick={() => {
          setOpen(true);
        }}
      >
        {copy.label}
      </Button>
      {blocked !== null && <Caption id={captionId} text={blocked} />}
      <ReasonDialog
        open={open}
        title={copy.title}
        description={`${copy.description} ${CHECKER_AUDIT_NOTE}`}
        confirmLabel={copy.label}
        reason={copy.reason}
        reasonLabel={copy.reasonLabel}
        reasonHelperText={copy.reasonHelperText}
        action={approve}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify(APPROVED_TOAST[outcomeRef.current]);
        }}
        fields={() => (
          <>
            <input type="hidden" name="tenantId" value={tenantId} />
            <input type="hidden" name="membershipId" value={membershipId} />
          </>
        )}
      />
    </Box>
  );
}

interface BranchActionCopy {
  /** The row's short label; the accessible name adds the branch. */
  label: string;
  accessibleName: string;
  confirmLabel: string;
  title: string;
  description: string;
  reason: 'optional' | 'required';
  reasonLabel?: string;
  success: string;
  action: FormAction;
}

function branchCopy(id: CheckerBranchAction, name: string): BranchActionCopy {
  switch (id) {
    case 'submit':
      return {
        label: 'Submit',
        accessibleName: `Submit ${name} for approval`,
        confirmLabel: 'Submit for approval',
        title: `Submit ${name} for approval?`,
        description: `Another administrator must then activate it: as its submitter, you can't. ${CHECKER_AUDIT_NOTE}`,
        reason: 'optional',
        success: 'Submitted for approval',
        action: submitInstitutionBranch,
      };
    case 'activate':
      return {
        label: 'Activate',
        accessibleName: `Activate ${name}`,
        confirmLabel: 'Activate',
        title: `Activate ${name}?`,
        description: `${decisionCopy('activate', name).description} ${CHECKER_AUDIT_NOTE}`,
        reason: 'optional',
        success: ACTIVATED_TOAST,
        action: activateInstitutionBranch,
      };
    case 'return': {
      const copy = sendBackCopy('return', name);
      return {
        label: 'Return',
        accessibleName: `Return ${name} for changes`,
        confirmLabel: copy.label,
        title: copy.title,
        description: `${copy.description} ${CHECKER_AUDIT_NOTE}`,
        reason: 'required',
        reasonLabel: copy.reasonLabel,
        success: copy.success,
        action: returnInstitutionBranch,
      };
    }
    case 'withdraw': {
      const copy = sendBackCopy('withdraw', name);
      return {
        label: copy.label,
        accessibleName: `Withdraw ${name}`,
        confirmLabel: copy.label,
        title: copy.title,
        // The platform has no branch edit: the institution changes and resubmits it.
        description: 'It goes back to draft, where it can be changed and submitted again.',
        reason: 'required',
        reasonLabel: copy.reasonLabel,
        success: copy.success,
        action: returnInstitutionBranch,
      };
    }
  }
}

interface BranchCheckerActionsProps {
  tenantId: string;
  branchId: string;
  name: string;
  /** `checkerBranchActions`, in the row's order. */
  actions: readonly CheckerBranchAction[];
  /** Why Activate is disabled for this caller (`activateBlocked`), or null. */
  activateBlocked: string | null;
  contextOrganisationId?: string;
}

/** A branch's checker actions on the institution's Branches tab (BG-02): Submit for a draft;
 * Return (or its maker's Withdraw) and Activate for a pending one. Primitive props only. */
export function BranchCheckerActions({
  tenantId,
  branchId,
  name,
  actions,
  activateBlocked,
  contextOrganisationId,
}: BranchCheckerActionsProps) {
  const notify = useToast();
  const captionId = useId();
  const [open, setOpen] = useState<CheckerBranchAction | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const succeededRef = useFocusTitleOnUnmount();
  const actionKey = actions.join(',');

  // A Submit leaves the row with Withdraw and Activate, so the component stays: focus goes to the
  // first enabled action still offered, else the record title (DecisionBar's rule).
  useEffect(() => {
    if (!succeededRef.current) return;
    succeededRef.current = false;
    const target = (actionKey === '' ? [] : actionKey.split(','))
      .map((id) => buttonRefs.current.get(id))
      .find((node) => node?.isConnected && !node.disabled);
    if (target) target.focus();
    else focusRecordTitle();
  }, [actionKey, succeededRef]);

  return (
    <Box sx={ROW_SX}>
      {actions.map((id) => {
        const copy = branchCopy(id, name);
        const blocked = id === 'activate' && activateBlocked !== null;
        return (
          <Button
            key={id}
            ref={(node) => {
              buttonRefs.current.set(id, node);
            }}
            size="small"
            variant={id === 'submit' || id === 'activate' ? 'contained' : 'outlined'}
            aria-label={copy.accessibleName}
            disabled={blocked}
            aria-describedby={blocked ? captionId : undefined}
            onClick={() => {
              setOpen(id);
            }}
          >
            {copy.label}
          </Button>
        );
      })}
      {actions.includes('activate') && activateBlocked !== null && (
        <Caption id={captionId} text={activateBlocked} />
      )}
      {actions.map((id) => {
        const copy = branchCopy(id, name);
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.confirmLabel}
            reason={copy.reason}
            reasonLabel={copy.reasonLabel}
            action={copy.action}
            contextOrganisationId={contextOrganisationId}
            onClose={() => {
              setOpen(null);
            }}
            onSuccess={() => {
              succeededRef.current = true;
              setOpen(null);
              notify(copy.success);
            }}
            fields={() => (
              <>
                <input type="hidden" name="tenantId" value={tenantId} />
                <input type="hidden" name="branchId" value={branchId} />
              </>
            )}
          />
        );
      })}
    </Box>
  );
}
