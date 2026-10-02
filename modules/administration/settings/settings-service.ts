import 'server-only';
import { apiGet } from '@/lib/api/tenant-api';
import { settingsPageSchema } from './settings-contract';

/**
 * One page at the backend's maximum size (contract §A).
 * ponytail: the catalogue is six keys plus a few stored extras; the page captions it if there are
 * ever more than 100.
 */
export function listSettings() {
  return apiGet('/api/v1/tenant/settings?size=100', settingsPageSchema);
}
