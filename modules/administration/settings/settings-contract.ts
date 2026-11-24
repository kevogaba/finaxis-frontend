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
    // False for a stored value, and always for base_currency (it mirrors the organisation's column).
    is_default: z.boolean(),
    // The catalogue's own metadata; null only for a stored key outside the catalogue.
    label: z.string().nullable(),
    description: z.string().nullable(),
    group: z.string().nullable(),
  })
  .transform((setting) => ({
    key: setting.key,
    // The mask is never a value: the UI shows "Hidden" and never offers the key for changes.
    value: setting.value === REDACTED ? null : setting.value,
    redacted: setting.value === REDACTED,
    valueType: setting.value_type,
    isDefault: setting.is_default,
    label: setting.label,
    description: setting.description,
    group: setting.group,
  }));

export type TenantSetting = z.output<typeof settingSchema>;

export const settingsPageSchema = pageSchema(settingSchema);
