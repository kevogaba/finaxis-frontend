'use client';

import { useSyncExternalStore } from 'react';
import { useColorScheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import SettingsBrightnessOutlined from '@mui/icons-material/SettingsBrightnessOutlined';

type ColorSchemeMode = 'light' | 'dark' | 'system';

const subscribeNever = () => () => undefined;

/**
 * Hydration-safe "has the client mounted" check — the same
 * `useSyncExternalStore` technique MUI's own `InitColorSchemeScript` uses,
 * rather than the `useEffect` + `setState` "mounted" anti-pattern.
 */
function useIsMounted() {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * Persists via MUI's own color-scheme storage (see InitColorSchemeScript in the
 * root layout) — no custom context or storage needed.
 */
export function ThemeModeToggle() {
  const { mode, setMode } = useColorScheme();
  const mounted = useIsMounted();

  const value: ColorSchemeMode = mounted ? (mode ?? 'system') : 'system';

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={(_event, next: ColorSchemeMode | null) => {
        if (next) {
          setMode(next);
        }
      }}
      aria-label="Theme mode"
      size="small"
      sx={{ '& .MuiToggleButton-root': { minWidth: 44, minHeight: 44 } }}
    >
      <ToggleButton value="light" aria-label="Light mode">
        <LightModeOutlined fontSize="small" />
      </ToggleButton>
      <ToggleButton value="system" aria-label="Match system theme">
        <SettingsBrightnessOutlined fontSize="small" />
      </ToggleButton>
      <ToggleButton value="dark" aria-label="Dark mode">
        <DarkModeOutlined fontSize="small" />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
