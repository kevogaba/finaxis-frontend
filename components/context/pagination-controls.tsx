import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { BrowserPageMetadata } from '@/auth/context-browser-dto';

interface PaginationControlsProps {
  ariaLabel: string;
  disabled: boolean;
  onPageChange: (page: number) => void;
  page: BrowserPageMetadata;
}

export function PaginationControls({
  ariaLabel,
  disabled,
  onPageChange,
  page,
}: PaginationControlsProps) {
  if (!page.hasNext && !page.hasPrevious) {
    return null;
  }

  return (
    <Stack
      aria-label={ariaLabel}
      component="nav"
      direction="row"
      spacing={1}
      sx={{ alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Button
        disabled={disabled || !page.hasPrevious}
        onClick={() => {
          onPageChange(page.number - 1);
        }}
        size="small"
        type="button"
        variant="outlined"
      >
        Previous
      </Button>
      <Typography color="text.secondary" variant="body2">
        Page {page.number + 1} of {Math.max(page.totalPages, 1)}
      </Typography>
      <Button
        disabled={disabled || !page.hasNext}
        onClick={() => {
          onPageChange(page.number + 1);
        }}
        size="small"
        type="button"
        variant="outlined"
      >
        Next
      </Button>
    </Stack>
  );
}
