'use client';

import { createAuthClient } from 'better-auth/react';

// The generic-oauth server plugin (auth/auth.ts) now registers Keycloak as a
// first-class social provider — better-auth 1.7 dropped the separate
// `genericOAuthClient()` client plugin in favor of the core `signIn.social`
// method (see components/auth/continue-with-keycloak-button.tsx), so no
// client plugin is needed here at all.
export const authClient = createAuthClient();
