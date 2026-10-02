'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@mui/material/Button';
import ReplayOutlined from '@mui/icons-material/ReplayOutlined';
import { ConfirmDialog } from '@/components/data-display/confirm-dialog';
import { focusRecordTitle } from '@/components/data-display/focus-record-title';
import { useToast } from '@/components/providers/toast-provider';
import { retryTenantBootstrap } from '../tenant-actions';

interface RetryBootstrapButtonProps {
  tenantId: string;
  tenantName: string;
  /** I2: the organisation the page rendered for. */
  contextOrganisationId?: string;
}

/** The Provisioning tab's Retry bootstrap (spec §11.2), offered only for a FAILED bootstrap. */
export function RetryBootstrapButton({
  tenantId,
  tenantName,
  contextOrganisationId,
}: RetryBootstrapButtonProps) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const succeededRef = useRef(false);

  // A successful retry leaves FAILED, so the page drops this button while it holds focus: the
  // record title takes it instead (standing ruling 4; 08's unmount-cleanup pattern).
  useEffect(() => {
    const successRef = succeededRef;
    return () => {
      if (successRef.current) focusRecordTitle();
    };
  }, []);

  return (
    <>
      <Button
        variant="contained"
        startIcon={<ReplayOutlined />}
        onClick={() => {
          setOpen(true);
        }}
      >
        Retry bootstrap
      </Button>
      <ConfirmDialog
        open={open}
        title={`Retry ${tenantName}'s bootstrap?`}
        description="This runs the first administrator's provisioning again: the identity, its membership and the invitation."
        confirmLabel="Retry bootstrap"
        action={retryTenantBootstrap}
        contextOrganisationId={contextOrganisationId}
        onClose={() => {
          setOpen(false);
        }}
        onSuccess={() => {
          succeededRef.current = true;
          setOpen(false);
          notify('Bootstrap retry started');
        }}
      >
        <input type="hidden" name="tenantId" value={tenantId} />
      </ConfirmDialog>
    </>
  );
}
