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
import type { BrowserOrganisation } from '@/auth/context-browser-dto';
import type { ApplicationContextModule } from '@/config/application-context';
import { useToast } from '@/components/providers/toast-provider';
import {
  fetchOrganisations,
  isContextLost,
  isSessionExpired,
  selectBranchRequest,
  selectOrganisationRequest,
} from '@/components/context/context-api';
import { nextStepAfterOrganisation } from '@/components/context/use-context-selection';

type ModuleId = ApplicationContextModule['id'];

/** Discovery pages are 25 long, so this bounds the platform lookup at 100 organisations. */
const MAX_ORGANISATION_PAGES = 4;

/**
 * The backend filters discovery after paging (BG-23), so the platform organisation can sit past a
 * short first page: follow `hasNext`, bounded, until it turns up.
 */
async function findOrganisation(organisationId: string): Promise<BrowserOrganisation | null> {
  for (let page = 0; page < MAX_ORGANISATION_PAGES; page += 1) {
    const result = await fetchOrganisations(page);
    const found = result.items.find((item) => item.organisationId === organisationId);
    if (found) return found;
    if (!result.page.hasNext) break;
  }
  return null;
}

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
  const notify = useToast();
  const popoverId = useId();
  const titleId = useId();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [platform, setPlatform] = useState<BrowserOrganisation | null | undefined>(undefined);
  const [switching, setSwitching] = useState(false);
  const open = Boolean(anchorEl);
  // The label trigger sits at the left of the app bar; anchoring its popover under the trigger's
  // own left edge (instead of the icon trigger's right anchor) keeps the 320px paper off the rail.
  const horizontal = trigger === 'label' ? 'left' : 'right';

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    void findOrganisation(platformOrganisationId)
      .then(setPlatform)
      .catch((error: unknown) => {
        if (isSessionExpired(error)) {
          setAnchorEl(null);
          router.replace('/login?reason=session_expired');
          return;
        }
        setPlatform(null);
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

  const openPlatform = async (name: string) => {
    if (currentModuleId === 'platform-administration') {
      close();
      return;
    }
    setSwitching(true);
    // Only the organisation POST can leave the switch stranded: once it succeeds the platform
    // organisation is already committed (spec §6.5), so a failed auto-pin below must never reach
    // onOpenContextSwitcher — that would re-open the dialog on top of a token that already moved.
    let step: ReturnType<typeof nextStepAfterOrganisation>;
    try {
      step = nextStepAfterOrganisation(await selectOrganisationRequest(platformOrganisationId));
    } catch {
      close();
      setSwitching(false);
      onOpenContextSwitcher();
      return;
    }
    let pin: 'ok' | 'lost' | 'failed' = step === 'done-branch' ? 'ok' : 'failed';
    if (typeof step === 'object') {
      try {
        await selectBranchRequest(step.autoSelect);
        pin = 'ok';
      } catch (error) {
        // A 401 here means the session expired, not that the pin failed — that never succeeds on
        // its own refresh, so send the user straight to login like the dialog and the hook do,
        // with no toast or push.
        if (isSessionExpired(error)) {
          close();
          setSwitching(false);
          router.replace('/login?reason=session_expired');
          return;
        }
        // A failed auto-pin still lands at All branches, exactly as closing the context dialog mid
        // auto-pin does — unless the branch endpoint also cleared the context cookie (403/409), in
        // which case there is nothing left to land on and the shared layout must send the user to
        // /select-context instead.
        pin = isContextLost(error) ? 'lost' : 'failed';
      }
    }
    close();
    setSwitching(false);
    if (pin === 'lost') {
      router.refresh();
      return;
    }
    notify(pin === 'ok' ? `Switched to ${name}` : `Switched to ${name} · All branches`);
    router.push('/platform-admin');
    router.refresh();
  };

  const triggerProps = {
    'aria-controls': open ? popoverId : undefined,
    'aria-haspopup': 'dialog' as const,
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
        anchorOrigin={{ vertical: 'bottom', horizontal }}
        transformOrigin={{ vertical: 'top', horizontal }}
        slotProps={{
          paper: { role: 'dialog', 'aria-labelledby': titleId, sx: { width: 320, p: 3.5 } },
        }}
      >
        <Typography id={titleId} component="h2" variant="subtitle2" sx={{ fontWeight: 700 }}>
          Finaxis apps
        </Typography>
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 3 }}>
          Choose a workspace
        </Typography>
        {platform === undefined || switching ? (
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
            {platform && (
              <Tile
                title="Platform administration"
                description="Tenant governance"
                icon={DomainOutlined}
                selected={currentModuleId === 'platform-administration'}
                onClick={() => {
                  void openPlatform(platform.displayName);
                }}
              />
            )}
          </Box>
        )}
      </Popover>
    </>
  );
}
