'use client';

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import type { BrowserOrganisation, BrowserPage } from '@/auth/context-browser-dto';
import { DEFAULT_CONTEXT_DESTINATION } from '@/auth/context-destination';
import { ContextSelectionForm } from './context-selection-form';

const SESSION_EXPIRED_REDIRECT = '/login?reason=session_expired';

interface ContextSelectionPageProps {
  organisations: BrowserPage<BrowserOrganisation>;
  destination?: string;
  hasOrganisationLoadError?: boolean;
}

export function ContextSelectionPage({
  destination = DEFAULT_CONTEXT_DESTINATION,
  organisations,
  hasOrganisationLoadError = false,
}: ContextSelectionPageProps) {
  const router = useRouter();

  return (
    <Box
      component="main"
      className="flex min-h-dvh items-center justify-center p-4"
      sx={{ bgcolor: 'background.default' }}
    >
      <Paper
        component="section"
        variant="outlined"
        sx={{ maxWidth: 560, p: { xs: 3, sm: 4 }, width: '100%' }}
      >
        <Stack spacing={3}>
          <Box>
            <Typography component="h1" variant="h1">
              Select your context
            </Typography>
            <Typography sx={{ color: 'text.secondary', mt: 1 }}>
              Choose the organisation and branch you want to work in.
            </Typography>
          </Box>
          <ContextSelectionForm
            initialOrganisations={organisations}
            hasOrganisationLoadError={hasOrganisationLoadError}
            onComplete={() => {
              router.replace(destination);
            }}
            onSessionExpired={() => {
              router.replace(SESSION_EXPIRED_REDIRECT);
            }}
          />
        </Stack>
      </Paper>
    </Box>
  );
}
