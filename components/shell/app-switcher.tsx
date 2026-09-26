'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AppsOutlined from '@mui/icons-material/AppsOutlined';
import DomainOutlined from '@mui/icons-material/DomainOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import type { ApplicationContextModule } from '@/config/application-context';
import { fetchOrganisations, selectOrganisationRequest } from '@/components/context/context-api';
import { nextStepAfterOrganisation } from '@/components/context/use-context-selection';

type ModuleId = ApplicationContextModule['id'];

interface AppSwitcherProps {
  currentModuleId: ModuleId;
  platformOrganisationId: string;
  onOpenContextSwitcher: () => void;
  trigger: 'icon' | 'label';
  moduleName?: string;
}

interface TileProps {
  title: string;
  description: string;
  selected: boolean;
  icon: typeof SettingsOutlined;
  onClick: () => void;
}

function Tile({ title, description, selected, icon: Icon, onClick }: TileProps) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        minHeight: 126,
        p: 3.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        gap: 1.5,
        textAlign: 'left',
        border: 1,
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 1,
        bgcolor: selected ? 'status.infoBg' : 'transparent',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'status.infoBg',
        },
      }}
    >
      <Box
        sx={{
          width: 38,
          height: 38,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '8px',
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <Icon aria-hidden="true" />
      </Box>
      <Typography component="span" variant="subtitle2" sx={{ fontWeight: 700 }}>
        {title}
      </Typography>
      <Typography component="span" variant="caption" color="text.secondary">
        {description}
      </Typography>
    </ButtonBase>
  );
}

/** Fiori-style two-workspace switcher (prototype `.app-switch`). Switching is a real context change. */
export function AppSwitcher({
  currentModuleId,
  platformOrganisationId,
  onOpenContextSwitcher,
  trigger,
  moduleName,
}: AppSwitcherProps) {
  const router = useRouter();
  const popoverId = useId();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [hasPlatform, setHasPlatform] = useState<boolean | null>(null);
  const [switching, setSwitching] = useState(false);
  const open = Boolean(anchorEl);

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    // ponytail: first page (25) of organisations only; a platform member with >25 memberships
    // would not see the tile — page through if that ever happens.
    void fetchOrganisations(0)
      .then((page) => {
        setHasPlatform(page.items.some((item) => item.organisationId === platformOrganisationId));
      })
      .catch(() => {
        setHasPlatform(false);
      });
  };

  const close = () => {
    setAnchorEl(null);
  };

  const openAdministration = () => {
    close();
    if (currentModuleId !== 'administration') {
      onOpenContextSwitcher();
    }
  };

  const openPlatform = async () => {
    if (currentModuleId === 'platform-administration') {
      close();
      return;
    }
    setSwitching(true);
    try {
      const selection = await selectOrganisationRequest(platformOrganisationId);
      const step = nextStepAfterOrganisation(selection);
      close();
      if (step === 'done-branch' || step === 'done-institution') {
        router.push('/platform-admin');
        router.refresh();
        return;
      }
      onOpenContextSwitcher();
    } catch {
      close();
      onOpenContextSwitcher();
    } finally {
      setSwitching(false);
    }
  };

  const triggerProps = {
    'aria-controls': open ? popoverId : undefined,
    'aria-haspopup': 'true' as const,
    'aria-expanded': open ? ('true' as const) : undefined,
    onClick: handleOpen,
  };

  return (
    <>
      {trigger === 'icon' ? (
        <Tooltip title="Switch application">
          <IconButton aria-label="Switch application" {...triggerProps}>
            <AppsOutlined />
          </IconButton>
        </Tooltip>
      ) : (
        <ButtonBase
          aria-label={`Current workspace: ${moduleName ?? ''}. Switch application`}
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 2.5,
            height: 46,
            px: 3,
            flexShrink: 0,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'surfaces.secondary',
          }}
          {...triggerProps}
        >
          <AppsOutlined fontSize="small" aria-hidden="true" />
          <Typography
            variant="subtitle2"
            component="span"
            noWrap
            sx={{ display: { xs: 'none', md: 'block' }, fontWeight: 700 }}
          >
            {moduleName}
          </Typography>
          <KeyboardArrowDownOutlined fontSize="small" aria-hidden="true" />
        </ButtonBase>
      )}
      <Popover
        id={popoverId}
        anchorEl={anchorEl}
        open={open}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 320, p: 3.5 } } }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Finaxis apps
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 3 }}>
          Choose a workspace
        </Typography>
        {hasPlatform === null || switching ? (
          <Box role="status" sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={20} aria-label="Loading workspaces" />
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <Tile
              title="Administration"
              description="Institution controls"
              icon={SettingsOutlined}
              selected={currentModuleId === 'administration'}
              onClick={openAdministration}
            />
            {hasPlatform && (
              <Tile
                title="Platform administration"
                description="Tenant governance"
                icon={DomainOutlined}
                selected={currentModuleId === 'platform-administration'}
                onClick={() => {
                  void openPlatform();
                }}
              />
            )}
          </Box>
        )}
      </Popover>
    </>
  );
}
