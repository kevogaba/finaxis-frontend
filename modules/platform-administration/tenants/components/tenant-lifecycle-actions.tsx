'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { ReasonDialog } from '@/components/data-display/reason-dialog';
import NextLink from '@/components/navigation/next-link';
import { useToast } from '@/components/providers/toast-provider';
import type { FormAction } from '@/lib/api/action-result';
import {
  approveTenant,
  deprovisionTenant,
  reactivateTenant,
  rejectTenant,
  submitTenant,
  suspendTenant,
} from '../tenant-actions';
import type { TenantLifecycleAction } from '../tenant-rules';

type DialogAction = Exclude<TenantLifecycleAction, 'amend'>;

interface ActionCopy {
  label: string;
  title: string;
  description: string;
  /** `null`: the endpoint reads no body (contract §E.2), so a ConfirmDialog without a reason. */
  reason: 'optional' | 'required' | null;
  /** Irreversible: an error-toned trigger and dialog. */
  destructive: boolean;
  success: string;
  action: FormAction;
}

function copyFor(id: DialogAction, name: string): ActionCopy {
  switch (id) {
    case 'submit':
      return {
        label: 'Submit for approval',
        title: `Submit ${name} for approval?`,
        description:
          'A different platform administrator must approve it. Approval provisions the institution and invites its first administrator.',
        reason: null,
        destructive: false,
        success: 'Submitted for approval',
        action: submitTenant,
      };
    case 'approve':
      return {
        label: 'Approve',
        title: `Approve ${name}?`,
        description:
          "Approval activates the institution, creates its head office and default roles, and queues its first administrator's account. Someone who created or submitted the request can't approve it.",
        reason: null,
        destructive: false,
        success: 'Approved. Provisioning is queued.',
        action: approveTenant,
      };
    case 'reject':
      return {
        label: 'Reject',
        title: `Reject ${name}?`,
        description:
          "Rejecting is permanent: the request can't be resubmitted, and its tenant code stays taken.",
        reason: 'required',
        destructive: true,
        success: 'Request rejected',
        action: rejectTenant,
      };
    case 'suspend':
      return {
        label: 'Suspend',
        title: `Suspend ${name}?`,
        description: 'Nobody can work in a suspended institution until it is reactivated.',
        reason: 'required',
        destructive: false,
        success: 'Institution suspended',
        action: suspendTenant,
      };
    case 'reactivate':
      return {
        label: 'Reactivate',
        title: `Reactivate ${name}?`,
        description: 'Members can work in the institution again.',
        reason: 'optional',
        destructive: false,
        success: 'Institution reactivated',
        action: reactivateTenant,
      };
    case 'deprovision':
      return {
        label: 'Deprovision',
        title: `Deprovision ${name}?`,
        description:
          'Deprovisioning is permanent. Nobody can work in the institution afterwards, and its assignments are revoked.',
        reason: 'required',
        destructive: true,
        success: 'Institution deprovisioned',
        action: deprovisionTenant,
      };
  }
}

interface TenantLifecycleActionsProps {
  tenantId: string;
  tenantName: string;
  /** Typed back before a deprovision (CRITICAL, spec §11.2). */
  tenantCode: string;
  actions: readonly TenantLifecycleAction[];
  /** I2: the organisation the page rendered for. */
  contextOrganisationId?: string;
}

/** The record hero's lifecycle (spec §11.2): availability comes from `availableTenantActions`. */
export function TenantLifecycleActions({
  tenantId,
  tenantName,
  tenantCode,
  actions,
  contextOrganisationId,
}: TenantLifecycleActionsProps) {
  const notify = useToast();
  const [open, setOpen] = useState<DialogAction | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLElement | null>());
  // 08's I3: a success swaps the action set (refresh()). Focus the same action if it is still
  // offered, else the first one, else the title. `succeededRef` is set only by a real success;
  // the effect keys on the set's contents, not the array the server re-sends on every render.
  const succeededRef = useRef<string | null>(null);
  const actionKey = actions.join(',');

  useEffect(() => {
    const succeeded = succeededRef.current;
    if (succeeded === null) return;
    succeededRef.current = null;
    const current = actionKey === '' ? [] : actionKey.split(',');
    const target = [succeeded, ...current]
      .filter((id) => current.includes(id))
      .map((id) => buttonRefs.current.get(id))
      .find((node) => node?.isConnected);
    if (target) target.focus();
    else focusRecordTitle();
  }, [actionKey]);

  // Reject and Deprovision empty the set, so the layout unmounts this component: the same
  // fallback runs from the cleanup (aliasing the ref object reads its live value, as in 08).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current !== null) focusRecordTitle();
    };
  }, []);

  const dialogActions = actions.filter((id): id is DialogAction => id !== 'amend');

  return (
    <>
      {actions.map((id, index) => {
        const variant = index === 0 ? 'contained' : 'outlined';
        const register = (node: HTMLElement | null) => {
          buttonRefs.current.set(id, node);
        };
        if (id === 'amend') {
          return (
            <Button
              key={id}
              ref={register}
              component={NextLink}
              href={`/platform-admin/tenants/${tenantId}/amend`}
              variant={variant}
            >
              Amend draft
            </Button>
          );
        }
        const copy = copyFor(id, tenantName);
        return (
          <Button
            key={id}
            ref={register}
            variant={variant}
            color={copy.destructive ? 'error' : 'primary'}
            onClick={() => {
              setOpen(id);
            }}
          >
            {copy.label}
          </Button>
        );
      })}
      {dialogActions.map((id) => {
        const copy = copyFor(id, tenantName);
        const close = () => {
          setOpen(null);
        };
        const succeed = () => {
          succeededRef.current = id;
          setOpen(null);
          notify(copy.success);
        };
        if (copy.reason === null) {
          return (
            <ConfirmDialog
              key={id}
              open={open === id}
              title={copy.title}
              description={copy.description}
              confirmLabel={copy.label}
              action={copy.action}
              contextOrganisationId={contextOrganisationId}
              onClose={close}
              onSuccess={succeed}
            >
              <input type="hidden" name="tenantId" value={tenantId} />
            </ConfirmDialog>
          );
        }
        return (
          <ReasonDialog
            key={id}
            open={open === id}
            title={copy.title}
            description={copy.description}
            confirmLabel={copy.label}
            reason={copy.reason}
            tone={copy.destructive ? 'error' : undefined}
            action={copy.action}
            contextOrganisationId={contextOrganisationId}
            onClose={close}
            onSuccess={succeed}
            fields={(fieldErrors) => (
              <>
                <input type="hidden" name="tenantId" value={tenantId} />
                {id === 'deprovision' && (
                  <>
                    <input type="hidden" name="tenantCode" value={tenantCode} />
                    <TextField
                      name="confirmCode"
                      label={`Type ${tenantCode} to confirm`}
                      required
                      error={Boolean(fieldErrors.confirmCode)}
                      helperText={fieldErrors.confirmCode ?? 'The tenant code, exactly as shown.'}
                      slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
                    />
                  </>
                )}
              </>
            )}
          />
        );
      })}
    </>
  );
}
