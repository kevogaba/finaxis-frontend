'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import { DescriptionList } from '@/components/data-display/description-list';
import { useListNavigationContext } from '@/components/data-display/list-navigation-context';
import { useListNavigationPending } from '@/components/data-display/use-list-navigation';

export interface AuditDrawerDetail {
  title: string;
  occurred: string;
  facts: readonly { label: string; value: string }[];
  before: string | null;
  after: string | null;
  metadata: string | null;
}

function JsonBlock({
  title,
  value,
  empty,
}: {
  title: string;
  value: string | null;
  empty: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="subtitle2" component="h3" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      {value ? (
        <Box
          component="pre"
          sx={{
            m: 0,
            p: 3,
            borderRadius: 1,
            bgcolor: 'surfaces.secondary',
            fontSize: '0.75rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
        >
          {value}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {empty}
        </Typography>
      )}
    </Box>
  );
}

/** Event detail panel, open whenever rendered; closing navigates back to the list URL. */
export function AuditEventDrawer({
  detail,
  closeHref,
}: {
  detail: AuditDrawerDetail;
  closeHref: string;
}) {
  const router = useRouter();
  // Reuses the toolbar/pagination's shared transition when one is above (page.tsx wraps both the
  // list and the drawer in one ListNavigationProvider), so closing also flips the shared
  // `isPending` — otherwise closing the drawer is a full round trip with no feedback at all.
  const ctx = useListNavigationContext();
  const [, localStartTransition] = useTransition();
  const startTransition = ctx?.startTransition ?? localStartTransition;
  // A `LinearProgress` elsewhere on the page would be behind this modal's own backdrop (and,
  // while the backdrop is up, `aria-hidden` on the rest of the app hides an aria-busy region from
  // assistive tech too) — the Close button's own `loading` state is the one place feedback for
  // closing is actually visible and announced.
  const isPending = useListNavigationPending();
  const close = () => {
    startTransition(() => {
      router.push(closeHref, { scroll: false });
    });
  };

  return (
    <Drawer
      anchor="right"
      open
      onClose={close}
      // MUI's temporary Drawer paper already sets role="dialog" and aria-modal (Drawer.js), and is
      // itself the scroll container (overflowY: auto). We add only the accessible name and width.
      slotProps={{
        paper: {
          'aria-labelledby': 'audit-event-title',
          sx: { width: { xs: '100%', sm: 560 } },
        },
      }}
    >
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          px: 4.5,
          py: 3.75,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="overline" component="p" color="text.secondary">
            {detail.occurred}
          </Typography>
          <Typography id="audit-event-title" component="h2" variant="h4">
            {detail.title}
          </Typography>
        </Box>
        <Button variant="outlined" onClick={close} loading={isPending}>
          Close
        </Button>
      </Box>
      <DescriptionList items={detail.facts} columns={1} />
      <Box
        sx={{
          p: 4.5,
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        }}
      >
        <JsonBlock title="Before" value={detail.before} empty="No previous state recorded." />
        <JsonBlock title="After" value={detail.after} empty="No resulting state recorded." />
      </Box>
      <Box sx={{ px: 4.5, pb: 4.5 }}>
        <JsonBlock title="Metadata" value={detail.metadata} empty="No metadata." />
      </Box>
    </Drawer>
  );
}
