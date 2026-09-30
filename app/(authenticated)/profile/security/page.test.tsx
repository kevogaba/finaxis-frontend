import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/test-utils';

vi.mock('@/config/env.server', () => ({
  // A trailing slash, to prove the path isn't doubled.
  serverEnv: { KEYCLOAK_ISSUER: 'https://id.example/realms/finaxis/' },
}));
vi.mock('@/modules/profile/profile-service', () => ({
  requireProfile: () => Promise.resolve({}),
}));

const { default: ProfileSecurityPage } = await import('./page');

describe('ProfileSecurityPage', () => {
  it("opens the configured realm's account console in a new tab", async () => {
    renderWithProviders(await ProfileSecurityPage());

    const link = screen.getByRole('link', { name: /Open account console/ });
    expect(link).toHaveAttribute('href', 'https://id.example/realms/finaxis/account');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
