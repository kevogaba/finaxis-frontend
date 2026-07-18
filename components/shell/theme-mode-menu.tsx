'use client';

import { useId, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import { useColorScheme } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined';

type ColorSchemeMode = 'light' | 'dark' | 'system';

const MODE_OPTIONS: { value: ColorSchemeMode; label: string; icon: typeof LightModeOutlined }[] = [
  { value: 'system', label: 'System default', icon: SettingsBrightnessOutlined },
  { value: 'light', label: 'Light', icon: LightModeOutlined },
  { value: 'dark', label: 'Dark', icon: DarkModeOutlined },
];

const subscribeNever = () => () => undefined;

function useIsMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * Shell header theme control — a `Menu`-based equivalent of
 * `components/providers/theme-mode-toggle.tsx` (which stays on the login
 * page). Both read/write the same MUI `useColorScheme` state, so switching
 * mode in either place stays in sync everywhere.
 */
export function ThemeModeMenu() {
  const { mode, setMode } = useColorScheme();
  const mounted = useIsMounted();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = Boolean(anchorEl);
  const currentMode: ColorSchemeMode = mounted ? (mode ?? 'system') : 'system';

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <>
      <Tooltip title="Theme">
        <IconButton
          aria-label="Theme"
          aria-controls={open ? menuId : undefined}
          aria-haspopup="true"
          aria-expanded={open ? 'true' : undefined}
          onClick={handleOpen}
        >
          <SettingsBrightnessOutlined />
        </IconButton>
      </Tooltip>
      <Menu id={menuId} anchorEl={anchorEl} open={open} onClose={handleClose}>
        {MODE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            role="menuitemradio"
            selected={currentMode === option.value}
            aria-checked={currentMode === option.value}
            onClick={() => {
              setMode(option.value);
              handleClose();
            }}
          >
            <ListItemIcon>
              <option.icon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={option.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
