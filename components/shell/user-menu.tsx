'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined';
import NextLink from '@/components/navigation/next-link';
import type { FinaxisUser } from '@/auth/auth.types';
import { initialsOf } from './initials';

interface UserMenuProps {
  user: FinaxisUser;
}

export function UserMenu({ user }: UserMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
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
      <Button
        aria-label={user.name}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleOpen}
        color="inherit"
        sx={{ gap: 2.5, px: 1, height: 46, minWidth: 0 }}
      >
        <Avatar src={user.image} sx={{ width: 38, height: 38, fontSize: '0.8125rem' }}>
          {!user.image && initialsOf(user.name)}
        </Avatar>
        <Box
          component="span"
          sx={{
            display: { xs: 'none', lg: 'flex' },
            flexDirection: 'column',
            alignItems: 'flex-start',
            minWidth: 0,
            textAlign: 'left',
          }}
        >
          <Typography
            component="span"
            variant="subtitle2"
            noWrap
            sx={{ fontWeight: 700, maxWidth: 180 }}
          >
            {user.name}
          </Typography>
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ maxWidth: 180 }}
          >
            {user.email}
          </Typography>
        </Box>
        <KeyboardArrowDownOutlined fontSize="small" aria-hidden="true" />
      </Button>
      <Menu id={menuId} anchorEl={anchorEl} open={open} onClose={handleClose}>
        <Box sx={{ px: 2, py: 1, minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary">
            Signed in as
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {user.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={NextLink} href="/profile" onClick={handleClose}>
          <PersonOutlined fontSize="small" sx={{ mr: 1.5 }} />
          View profile
        </MenuItem>
        <Divider />
        <Box
          component="form"
          method="POST"
          action="/api/auth/logout"
          sx={{ px: 1, py: 0.5 }}
          onSubmit={() => {
            // Disabling the submit button must happen in onSubmit, not
            // onClick: a browser's native form-submission algorithm checks
            // whether the submitter is disabled as part of the click's
            // activation behavior, *before* the submit event fires. Setting
            // this state in onClick disables the button synchronously within
            // that same click dispatch, which makes Chromium (and other
            // browsers) silently cancel the submission — the button visibly
            // shows "Signing out…" forever and no request ever reaches
            // /api/auth/logout. jsdom-based unit tests don't reproduce this
            // spec behavior, so this only surfaces in a real browser (see
            // e2e/keycloak-smoke.spec.ts).
            setIsSigningOut(true);
          }}
        >
          <Button
            type="submit"
            fullWidth
            color="error"
            disabled={isSigningOut}
            startIcon={isSigningOut ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
          >
            {isSigningOut ? 'Signing out…' : 'Log out'}
          </Button>
        </Box>
      </Menu>
    </>
  );
}
