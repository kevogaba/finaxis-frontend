import { z } from 'zod';
import { pageSchema } from '@/lib/api/wire';

/** The backend's mask for sensitive and platform-only values (TenantSettingsService.MASK). */
const REDACTED = '***REDACTED***';

const settingSchema = z
  .object({
    key: z.string().min(1),
    value: z.string().nullable(),
    // A string, not an enum: stored keys outside the catalogue carry their own stored type.
    value_type: z.string(),
    sensitive: z.boolean(),
    platform_admin_only: z.boolean(),
  })
  .transform((setting) => ({
    key: setting.key,
    // The mask is never a value: the UI shows "Hidden" and never offers the key for changes.
    value: setting.value === REDACTED ? null : setting.value,
    redacted: setting.value === REDACTED,
    platformAdminOnly: setting.platform_admin_only,
  }));

export type TenantSetting = z.output<typeof settingSchema>;

export const settingsPageSchema = pageSchema(settingSchema);
