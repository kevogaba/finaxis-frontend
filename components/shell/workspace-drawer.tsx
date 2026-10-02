'use client';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Drawer from '@mui/material/Drawer';
import type { PaperProps } from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import ChevronLeftOutlined from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightOutlined from '@mui/icons-material/ChevronRightOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import { FinaxisLogo } from '@/components/branding/finaxis-logo';
import { WorkspaceNavigation, type WorkspaceNavigationItem } from './workspace-navigation';

export const RAIL_EXPANDED_WIDTH = 232;
export const RAIL_COLLAPSED_WIDTH = 76;
const MOBILE_WIDTH = 250;

interface WorkspaceDrawerProps {
  items: readonly WorkspaceNavigationItem[];
  navigationAriaLabel: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  footerTitle: string;
  footerSubtitle: string;
}

function railPaper(width: number): PaperProps {
  return {
    sx: (theme) => ({
      width,
      border: 0,
      overflowX: 'hidden',
      color: theme.vars.palette.brand.onNavy,
      backgroundColor: theme.vars.palette.brand.navy,
      backgroundImage: `linear-gradient(180deg, ${theme.vars.palette.brand.deep}, ${theme.vars.palette.brand.navy})`,
      transition: theme.transitions.create('width', { duration: theme.transitions.duration.short }),
    }),
  };
}

function RailBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Box
      sx={{
        height: 86,
        flexShrink: 0,
        px: 4.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 2.5,
        borderBottom: 1,
        borderColor: 'brand.onNavyBorder',
      }}
    >
      <FinaxisLogo size={collapsed ? 40 : 38} />
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            sx={{ fontSize: '1.375rem', fontWeight: 700, lineHeight: 1, color: 'brand.onNavy' }}
          >
            Finaxis
          </Typography>
          <Typography
            component="p"
            noWrap
            sx={{ mt: 1.5, fontSize: '0.625rem', color: 'brand.onNavyMuted' }}
          >
            People · Savings · Progress
          </Typography>
        </Box>
      )}
    </Box>
  );
}

interface RailContentProps {
  items: readonly WorkspaceNavigationItem[];
  navigationAriaLabel: string;
  collapsed: boolean;
  footerTitle: string;
  footerSubtitle: string;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}

function RailContent({
  items,
  navigationAriaLabel,
  collapsed,
  footerTitle,
  footerSubtitle,
  onNavigate,
  onToggleCollapsed,
}: RailContentProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <RailBrand collapsed={collapsed} />
      <WorkspaceNavigation
        items={items}
        ariaLabel={navigationAriaLabel}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
      {onToggleCollapsed && (
        <ButtonBase
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-expanded={!collapsed}
          sx={(theme) => ({
            mx: collapsed ? 5 : 4.5,
            height: 52,
            flexShrink: 0,
            gap: 3.5,
            justifyContent: collapsed ? 'center' : 'flex-start',
            color: theme.vars.palette.brand.onNavyMuted,
            borderTop: `1px solid ${theme.vars.palette.brand.onNavyBorder}`,
            borderBottom: `1px solid ${theme.vars.palette.brand.onNavyBorder}`,
            fontSize: '0.8125rem',
            '&:hover': { color: theme.vars.palette.brand.onNavy },
            '&.Mui-focusVisible': {
              // Same ruling as WorkspaceNavigation (layer 04 pre-flight scan): onNavy stays
              // ≥3:1 against every rail surface; the theme's default palette.focus ring does not.
              outline: `2px solid ${theme.vars.palette.brand.onNavy}`,
              outlineOffset: -2,
            },
          })}
        >
          {collapsed ? (
            <ChevronRightOutlined fontSize="small" />
          ) : (
            <ChevronLeftOutlined fontSize="small" />
          )}
          {!collapsed && <span>Collapse navigation</span>}
        </ButtonBase>
      )}
      <Box
        sx={{
          minHeight: 90,
          flexShrink: 0,
          px: 5.5,
          py: 4.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 3.5,
          color: 'brand.onNavyMuted',
        }}
      >
        <GroupsOutlined fontSize="small" aria-hidden="true" />
        {!collapsed && (
          <Box sx={{ minWidth: 0 }}>
            <Typography
              component="p"
              noWrap
              title={footerTitle}
              sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'brand.onNavy' }}
            >
              {footerTitle}
            </Typography>
            <Typography
              component="p"
              noWrap
              title={footerSubtitle}
              sx={{ mt: 1, fontSize: '0.625rem', color: 'brand.onNavyMuted' }}
            >
              {footerSubtitle}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Full-height navy rail: permanent (mini variant) from `md`, temporary drawer below. */
export function WorkspaceDrawer({
  items,
  navigationAriaLabel,
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
  footerTitle,
  footerSubtitle,
}: WorkspaceDrawerProps) {
  const width = collapsed ? RAIL_COLLAPSED_WIDTH : RAIL_EXPANDED_WIDTH;

  return (
    <>
      <Drawer
        variant="permanent"
        sx={(theme) => ({
          display: { xs: 'none', md: 'block' },
          width,
          flexShrink: 0,
          transition: theme.transitions.create('width', {
            duration: theme.transitions.duration.short,
          }),
        })}
        slotProps={{ paper: railPaper(width) }}
      >
        <RailContent
          items={items}
          navigationAriaLabel={navigationAriaLabel}
          collapsed={collapsed}
          footerTitle={footerTitle}
          footerSubtitle={footerSubtitle}
          onToggleCollapsed={onToggleCollapsed}
        />
      </Drawer>

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' } }}
        slotProps={{
          // MUI gives this Paper `role="dialog" aria-modal="true"` (temporary variant) but no
          // accessible name of its own; without one, axe flags `aria-dialog-name`. Distinct from
          // the nested nav's own "Administration"/"Platform Administration" label.
          paper: { ...railPaper(MOBILE_WIDTH), 'aria-label': 'Navigation menu' },
        }}
      >
        <ButtonBase
          onClick={onMobileClose}
          sx={(theme) => ({
            alignSelf: 'flex-start',
            m: 2,
            p: 2,
            gap: 1.75,
            color: theme.vars.palette.brand.onNavy,
            '&.Mui-focusVisible': {
              outline: `2px solid ${theme.vars.palette.brand.onNavy}`,
              outlineOffset: -2,
            },
          })}
        >
          <CloseOutlined fontSize="small" aria-hidden="true" />
          Close
        </ButtonBase>
        <RailContent
          items={items}
          navigationAriaLabel={navigationAriaLabel}
          collapsed={false}
          footerTitle={footerTitle}
          footerSubtitle={footerSubtitle}
          onNavigate={onMobileClose}
        />
      </Drawer>
    </>
  );
}
