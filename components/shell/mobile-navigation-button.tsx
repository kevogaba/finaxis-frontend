'use client';

import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import MenuOutlined from '@mui/icons-material/MenuOutlined';

interface MobileNavigationButtonProps {
  onClick: () => void;
}

export function MobileNavigationButton({ onClick }: MobileNavigationButtonProps) {
  return (
    <Tooltip title="Open navigation">
      <IconButton aria-label="Open navigation" onClick={onClick} sx={{ display: { md: 'none' } }}>
        <MenuOutlined />
      </IconButton>
    </Tooltip>
  );
}
