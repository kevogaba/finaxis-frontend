'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined';
import { ContextSwitcherDialog } from '@/components/shell/context-switcher-dialog';

/**
 * The Contexts tab's switch action (spec §10.9): the shared context dialog, as its own instance —
 * lifting AppShell's dialog state would edit the shell PR 07 edits in parallel. A same-organisation
 * switch refreshes this tab; another organisation lands on its workspace home (the dialog's rule).
 */
export function SwitchContextButton({
  platformOrganisationId,
}: {
  platformOrganisationId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outlined"
        startIcon={<SwapHorizOutlined />}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
        }}
      >
        Switch context
      </Button>
      <ContextSwitcherDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        platformOrganisationId={platformOrganisationId}
      />
    </>
  );
}
