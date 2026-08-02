import type { FinaxisUser } from './auth.types';

export interface MapAuthenticatedUserInput {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * Maps only validated Better Auth session fields to the application-facing
 * FinaxisUser shape. Keycloak does not yet emit role/branch/organization
 * claims, so those are always empty/undefined here rather than fabricated —
 * see docs/authentication/keycloak.md for the claim-mapping plan.
 */
export function mapAuthenticatedUser(input: MapAuthenticatedUserInput): FinaxisUser {
  return {
    id: input.id,
    name: input.name,
    email: input.email,
    username: undefined,
    image: input.image ?? undefined,
    roles: [],
    permissions: [],
    branches: [],
    organization: undefined,
  };
}
