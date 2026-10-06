'use client';

import { useId, useState } from 'react';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';
import NextLink from '@/components/navigation/next-link';

/** One line in the notifications popover, with its link (spec §8). */
export interface NotificationEntry {
  id: string;
  text: string;
  href: string;
  linkLabel: string;
}

export interface NotificationsMenuProps {
  /** The bell's accessible name: it carries the count, or says the count couldn't be read. */
  label: string;
  /** `null` when the count couldn't be read: the menu says so, never "none". */
  total: number | null;
  entries: readonly NotificationEntry[];
  emptyText: string;
  unavailableText: string;
}

/** The app-bar bell (spec §8): a count badge and a small dialog of entries. Primitive props only, so
 * a Server Component can render it (AGENTS.md). */
export function NotificationsMenu({
  label,
  total,
  entries,
  emptyText,
  unavailableText,
}: NotificationsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const titleId = useId();
  const dialogId = useId();
  const open = anchor !== null;
  const message = (text: string) => (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {text}
    </Typography>
  );
  return (
    <>
      <Tooltip title={label}>
        <IconButton
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={open ? 'true' : undefined}
          aria-controls={open ? dialogId : undefined}
          onClick={(event) => {
            setAnchor(event.currentTarget);
          }}
        >
          <Badge color="primary" badgeContent={total ?? 0} max={99} invisible={!total}>
            <NotificationsOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            id: dialogId,
            role: 'dialog',
            'aria-labelledby': titleId,
            sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2.5 },
          },
        }}
      >
        <Typography
          id={titleId}
          component="h2"
          variant="subtitle1"
          sx={{ fontWeight: 700, mb: 1.5 }}
        >
          Notifications
        </Typography>
        {total === null ? (
          message(unavailableText)
        ) : entries.length === 0 ? (
          message(emptyText)
        ) : (
          <Box
            component="ul"
            role="list"
            sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2 }}
          >
            {entries.map((entry) => (
              <li key={entry.id}>
                <Typography variant="body2">{entry.text}</Typography>
                <Link
                  component={NextLink}
                  href={entry.href}
                  variant="body2"
                  onClick={() => {
                    setAnchor(null);
                  }}
                  sx={{ fontWeight: 600 }}
                >
                  {entry.linkLabel}
                </Link>
              </li>
            ))}
          </Box>
        )}
      </Popover>
    </>
  );
}
