import Chip from '@mui/material/Chip';

interface PlatformStatusChipProps {
  status: string | null | undefined;
}

export function PlatformStatusChip({ status }: PlatformStatusChipProps) {
  const value = status?.trim() ?? 'Unknown';
  const normalized = value.toLowerCase();
  const color = normalized.includes('inactive')
    ? 'default'
    : normalized.includes('active') || normalized.includes('success')
      ? 'success'
      : normalized.includes('suspend') ||
          normalized.includes('reject') ||
          normalized.includes('fail')
        ? 'error'
        : normalized.includes('pending') || normalized.includes('draft')
          ? 'warning'
          : 'default';
  const label = value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return (
    <Chip
      label={label}
      color={color}
      size="small"
      variant="outlined"
      aria-label={`Status: ${label}`}
    />
  );
}
