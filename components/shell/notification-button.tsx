'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import Popover from '@mui/material/Popover';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import NotificationsOutlined from '@mui/icons-material/NotificationsOutlined';

const SAMPLE_BADGE_COUNT = 3;

/**
 * Shell header notification placeholder — badge shows a static sample
 * count; the popover content is a placeholder until real delivery is
 * connected. No notification backend yet.
 */
export function NotificationButton() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const popoverId = useId();
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label="Notifications"
          aria-controls={open ? popoverId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={handleOpen}
        >
          <Badge badgeContent={SAMPLE_BADGE_COUNT} color="error">
            <NotificationsOutlined />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        id={popoverId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ p: 2, maxWidth: 280 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Notifications
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Notifications will appear here once delivery is connected.
          </Typography>
        </Box>
      </Popover>
    </>
  );
}
