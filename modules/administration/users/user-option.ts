import { z } from 'zod';

/** A user as pickers show them — the browser-safe shape `/api/tenant/users` returns. */
export const tenantUserOptionSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  email: z.string(),
  username: z.string(),
  membershipStatus: z.string(),
});

export type TenantUserOption = z.output<typeof tenantUserOptionSchema>;

export const tenantUserOptionPageSchema = z.object({ items: z.array(tenantUserOptionSchema) });
