import 'server-only';
import { isPlatformOrganisation } from '@/config/application-context';
import { UUID_PATTERN } from '@/lib/api/wire';

/**
 * True for an id that can name an institution (BG-29): a well-formed UUID that is not the reserved
 * platform organisation. One check for every route and action that takes a tenant id, so the
 * platform organisation can never be opened, suspended or deprovisioned as an institution.
 * Case-insensitive on both parts, like the backend's UUID binding. Kept out of tenant-service.ts,
 * which the actions' unit test mocks whole.
 */
export function isInstitutionId(id: string): boolean {
  return UUID_PATTERN.test(id) && !isPlatformOrganisation(id);
}
