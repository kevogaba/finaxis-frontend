import type { Metadata } from 'next';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiLink from '@mui/material/Link';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import SavingsOutlined from '@mui/icons-material/SavingsOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import CalculateOutlined from '@mui/icons-material/CalculateOutlined';

import { FinaxisLogo } from '@/components/branding/finaxis-logo';
import { ProductFeature } from '@/components/branding/product-feature';
import { ThemeModeToggle } from '@/components/providers/theme-mode-toggle';
import { ContinueWithKeycloakButton } from '@/components/auth/continue-with-keycloak-button';
import { LoginStatusAlert } from '@/components/auth/login-status-alert';

export const metadata: Metadata = {
  title: 'Sign in',
};

const CAPABILITIES = [
  { icon: GroupsOutlined, label: 'Membership' },
  { icon: SavingsOutlined, label: 'Savings' },
  { icon: PaymentsOutlined, label: 'Loans' },
  { icon: CalculateOutlined, label: 'Accounting' },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface LoginPageProps {
  searchParams: Promise<{ error?: string | string[]; reason?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedParams = await searchParams;
  const error = firstParam(resolvedParams.error);
  const reason = firstParam(resolvedParams.reason);

  return (
    <Box className="flex min-h-dvh w-full flex-col overflow-x-hidden md:flex-row">
      {/* Compact brand header, mobile only */}
      <Box
        component="header"
        className="flex items-center gap-3 px-6 py-6 md:hidden"
        sx={{ bgcolor: 'brand.navy', color: 'brand.onNavy' }}
      >
        <FinaxisLogo size={36} />
        <Box>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, color: 'inherit', lineHeight: 1.2 }}
          >
            Finaxis
          </Typography>
          <Typography variant="caption" sx={{ color: 'brand.onNavyMuted' }}>
            Financial operations for member-based institutions.
          </Typography>
        </Box>
      </Box>

      {/* Brand panel, desktop only */}
      <Box
        component="aside"
        aria-label="About Finaxis"
        className="finaxis-brand-backdrop relative hidden flex-col justify-between overflow-hidden px-12 py-12 md:flex md:w-[52%]"
        sx={{ bgcolor: 'brand.navy', color: 'brand.onNavy' }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', position: 'relative' }}>
          <FinaxisLogo />
          <Typography variant="h6" sx={{ fontWeight: 700, color: 'inherit' }}>
            Finaxis
          </Typography>
        </Stack>

        <Box sx={{ maxWidth: 480, position: 'relative' }}>
          <Typography variant="overline" sx={{ color: 'brand.onNavyAccent', letterSpacing: 1.2 }}>
            SACCO core banking platform
          </Typography>
          <Typography
            component="p"
            variant="h3"
            sx={{ fontWeight: 700, mt: 1, mb: 2, color: 'inherit' }}
          >
            Financial operations, built around your members.
          </Typography>
          <Typography variant="body1" sx={{ color: 'brand.onNavyMuted' }}>
            Manage membership, savings, loans and accounting through one secure and connected SACCO
            platform.
          </Typography>
        </Box>

        <Box
          className="grid grid-cols-2 gap-3"
          sx={{ position: 'relative' }}
          aria-label="Platform capabilities"
        >
          {CAPABILITIES.map((capability) => (
            <ProductFeature
              key={capability.label}
              icon={capability.icon}
              label={capability.label}
            />
          ))}
        </Box>
      </Box>

      {/* Authentication panel */}
      <Box
        component="main"
        className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8 md:w-[48%]"
      >
        <Box className="flex w-full justify-end" sx={{ maxWidth: 440, mb: 3 }}>
          <ThemeModeToggle />
        </Box>

        <Box sx={{ width: '100%', maxWidth: 440 }}>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Welcome back
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
            Sign in to access your Finaxis workspace.
          </Typography>

          <LoginStatusAlert error={error} reason={reason} />
          <ContinueWithKeycloakButton />

          <Stack spacing={1} sx={{ alignItems: 'center', mt: 4 }}>
            <Typography variant="body2" color="text.secondary">
              Need help? <MuiLink href="mailto:support@finaxis.io">Contact support</MuiLink>
            </Typography>
            <Stack direction="row" spacing={2}>
              <MuiLink href="/legal/terms" variant="caption" color="text.secondary">
                Terms of service
              </MuiLink>
              <MuiLink href="/legal/privacy" variant="caption" color="text.secondary">
                Privacy policy
              </MuiLink>
            </Stack>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
