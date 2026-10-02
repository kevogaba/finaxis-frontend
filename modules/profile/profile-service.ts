import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FinaxisUser } from '@/auth/auth.types';
import { backendApi } from '@/auth/backend-api';
import { organisationPageSchema } from '@/auth/context-contract';
import type { BackendProfile } from '@/auth/context.types';
import { getCurrentContextProfile, profileToFinaxisUser } from '@/auth/context-service';
import { contextSelectionRedirectPath } from '@/auth/context-selection-redirect';
import { getAuthenticatedUser } from '@/auth/get-authenticated-user';
import type { ApplicationContext } from '@/config/application-context';
import { toQueryString } from '@/lib/api/query-string';
import { pageMetadataSchema, type Page } from '@/lib/api/wire';
import type { ProfileUser } from './profile-rules';

/**
 * The shell's user (unchanged `profileToFinaxisUser`) plus the profile's display fields.
 * `profileSchema` already de-duplicated the repeated branches and roles (contract §C, BG-23).
 */
export function toProfileUser(
  profile: BackendProfile,
  sessionUser: FinaxisUser,
): ProfileUser | null {
  const organisation = profile.organisation;
  if (!organisation) return null;
  return {
    ...profileToFinaxisUser(profile, sessionUser),
    organization: {
      id: organisation.id,
      name: organisation.name,
      code: organisation.code,
      status: organisation.status,
    },
    branches: profile.branches.map(({ id, code, name, status }) => ({ id, code, name, status })),
    membershipStatus: profile.membership.status,
    assignedRoles: profile.roles.map(({ id, code, name, status }) => ({ id, code, name, status })),
  };
}

/**
 * Session + resolved context for the profile layout and every tab page (a layout doesn't re-run
 * when a sibling tab navigates, so each page calls this too). `cache()` lets the layout and page of
 * one request share a single session check and a single `/auth/me`.
 */
export const requireProfile = cache(
  async (): Promise<{ user: ProfileUser; context: ApplicationContext }> => {
    const requestHeaders = await headers();
    const sessionUser = await getAuthenticatedUser(requestHeaders);
    if (!sessionUser) redirect('/login?reason=session_expired');
    const selected = await getCurrentContextProfile();
    if (selected.kind !== 'resolved') redirect(contextSelectionRedirectPath(requestHeaders));
    const user = toProfileUser(selected.profile, sessionUser);
    if (!user) redirect(contextSelectionRedirectPath(requestHeaders));
    return { user, context: selected.context };
  },
);

export interface MyOrganisation {
  id: string;
  code: string;
  name: string;
  membershipStatus: string;
}

/**
 * `GET /auth/organisations` (contract §E.1) with the bare session JWT — no context header. Parsed
 * by 05's `organisationPageSchema` (AGENTS.md: every `/auth/*` body goes through
 * `auth/context-contract.ts`), so a row missing any contract §C field fails to the safe
 * `ErrorState`. The backend filters after paging (BG-23), so a page can hold fewer rows than
 * `size`, or none.
 */
export async function listMyOrganisations(paging: {
  page: number;
  size: number;
}): Promise<Page<MyOrganisation>> {
  const raw = await backendApi.get<unknown>(
    `/api/v1/auth/organisations${toQueryString(paging)}`,
    await headers(),
  );
  const { items, page } = organisationPageSchema.parse(raw);
  return {
    items: items.map((organisation) => ({
      id: organisation.organisation_id,
      code: organisation.tenant_code,
      name: organisation.display_name,
      membershipStatus: organisation.membership_status,
    })),
    // Already validated above; this only renames the snake_case paging to `PageMetadata`.
    page: pageMetadataSchema.parse(page),
  };
}
