import Chip from '@mui/material/Chip';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'default';

const TONES: Record<string, StatusTone> = {
  ACTIVE: 'success',
  SUCCESS: 'success',
  COMPLETED: 'success',
  OPEN: 'success',
  APPROVED: 'success',
  PENDING_APPROVAL: 'warning',
  PENDING_ACTIVATION: 'warning',
  DRAFT: 'warning',
  INVITED: 'warning',
  QUEUED: 'warning',
  PROVISIONING: 'warning',
  PROVISIONING_IDP: 'warning',
  PROVISIONING_IDENTITY: 'warning',
  CLOSING: 'warning',
  DEACTIVATING: 'warning',
  DEPROVISIONING: 'warning',
  MEDIUM: 'warning',
  SUSPENDED: 'error',
  REJECTED: 'error',
  REVOKED: 'error',
  DEACTIVATED: 'error',
  DEPROVISIONED: 'error',
  LOCKED: 'error',
  DISABLED: 'error',
  FAILURE: 'error',
  FAILED: 'error',
  DENIED: 'error',
  HIGH: 'error',
  CRITICAL: 'error',
};

export function statusTone(value: string): StatusTone {
  return TONES[value] ?? 'default';
}

export function humanizeEnum(value: string): string {
  const words = value.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface StatusChipProps {
  value: string;
  label?: string;
  tone?: StatusTone;
}

/** The prototype's status badge: a soft pill whose label always carries the meaning. */
export function StatusChip({ value, label, tone = statusTone(value) }: StatusChipProps) {
  return <Chip size="small" variant="soft" color={tone} label={label ?? humanizeEnum(value)} />;
}
