'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import NextLink from '@/components/navigation/next-link';
import { APPLICATION_MODULES } from './shell.constants';

export function AppSwitcher() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Switch application">
        <IconButton
          aria-label="Switch application"
          aria-controls={open ? menuId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={handleOpen}
        >
          <AppsOutlined />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ list: { sx: { width: 320 } } }}
      >
        {APPLICATION_MODULES.map((applicationModule) => (
          <MenuItem
            key={applicationModule.id}
            component={applicationModule.enabled ? NextLink : 'div'}
            href={applicationModule.enabled ? applicationModule.href : undefined}
            disabled={!applicationModule.enabled}
            aria-disabled={!applicationModule.enabled}
            onClick={handleClose}
          >
            <ListItemIcon>
              <applicationModule.icon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={applicationModule.label}
              secondary={
                applicationModule.enabled ? undefined : (
                  <Typography component="span" variant="caption" color="text.secondary">
                    Coming later
                  </Typography>
                )
              }
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
