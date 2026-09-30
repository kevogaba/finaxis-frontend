import type { Metadata } from 'next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import { DescriptionList } from '@/components/data-display/description-list';
import { serverEnv } from '@/config/env.server';
import { ProfileSection } from '@/modules/profile/components/profile-section';
import { requireProfile } from '@/modules/profile/profile-service';

export const metadata: Metadata = { title: 'Security · Profile' };

export default async function ProfileSecurityPage() {
  await requireProfile();
  // Keycloak's account console root for the configured realm. Deep links (signing-in, device
  // activity) differ between Keycloak versions, so none are used. Built from validated config only.
  const accountConsoleUrl = `${serverEnv.KEYCLOAK_ISSUER.replace(/\/$/, '')}/account`;

  return (
    <ProfileSection
      title="Sign-in and security"
      description="Your identity provider (Keycloak) manages how you sign in."
    >
      <DescriptionList
        columns={1}
        items={[
          { label: 'Password', value: 'Change it in your account console.' },
          {
            label: 'Multi-factor authentication',
            value: 'Set it up or replace it in your account console.',
          },
          {
            label: 'Active sessions',
            value: 'Review your devices and sign out of the others in your account console.',
          },
        ]}
      />
      <Box sx={{ px: 4.5, pb: 4.5, display: 'grid', justifyItems: 'start', gap: 3 }}>
        {/* BG-17: MFA and session state live only in Keycloak. */}
        <Alert severity="info">
          Finaxis doesn&apos;t show your password, MFA, or session status. Your account console is
          the source of truth.
        </Alert>
        <Button
          variant="contained"
          component="a"
          href={accountConsoleUrl}
          target="_blank"
          rel="noopener noreferrer"
          endIcon={<OpenInNewOutlined />}
          aria-label="Open account console (opens in a new tab)"
        >
          Open account console
        </Button>
      </Box>
    </ProfileSection>
  );
}
