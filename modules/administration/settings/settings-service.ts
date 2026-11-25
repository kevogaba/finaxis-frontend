import 'server-only';
import { canTenantWide, type PermissionHolder } from '@/auth/permissions';
import { load } from '@/lib/api/load';
import { apiGet } from '@/lib/api/tenant-api';
import type { SwitchState } from '@/modules/administration/approvals/maker-checker';
import { settingSchema, settingsPageSchema } from './settings-contract';

/**
 * One page at the backend's maximum size (contract §A).
 * ponytail: the catalogue is six keys plus a few stored extras; the page captions it if there are
 * ever more than 100.
 */
export function listSettings() {
  return apiGet('/api/v1/tenant/settings?size=100', settingsPageSchema);
}

/**
 * A maker-checker switch (BG-08, ADR 0032): on unless the tenant stored the literal `"false"`
 * (MakerCheckerPolicy). `unknown` without `settings.view` tenant-wide (the platform checks it
 * there) or when the read fails, so the decision stays enabled and the platform's named refusal
 * explains itself (decision Q4); a lost session or a stale context still redirects (`load`).
 */
export async function readMakerCheckerSwitch(
  kind: 'user_invites' | 'branch_creation',
  holder: PermissionHolder,
): Promise<SwitchState> {
  if (!canTenantWide(holder, 'settings.view')) return 'unknown';
  const read = await load(
    apiGet(`/api/v1/tenant/settings/require_maker_checker_for_${kind}`, settingSchema),
  );
  if (!read.ok) return 'unknown';
  return read.value.value === 'false' ? 'off' : 'on';
}
