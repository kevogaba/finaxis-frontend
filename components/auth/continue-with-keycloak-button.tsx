'use client';

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { authClient } from '@/auth/auth-client';

export function ContinueWithKeycloakButton() {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleClick = async () => {
    if (isRedirecting) {
      return;
    }
    setIsRedirecting(true);
    setHasError(false);

    try {
      const { error } = await authClient.signIn.social({
        provider: 'keycloak',
        callbackURL: '/admin',
        errorCallbackURL: '/login?error=authentication_failed',
      });

      if (error) {
        setHasError(true);
        setIsRedirecting(false);
      }
    } catch {
      setHasError(true);
      setIsRedirecting(false);
    }
  };

  return (
    <Stack spacing={2}>
      {hasError && (
        <Alert severity="error" role="alert" variant="outlined">
          We couldn&apos;t start the sign-in process. Please try again.
        </Alert>
      )}
      <Button
        type="button"
        variant="contained"
        size="large"
        fullWidth
        disabled={isRedirecting}
        startIcon={isRedirecting ? <CircularProgress size={18} color="inherit" /> : undefined}
        onClick={() => {
          void handleClick();
        }}
      >
        {isRedirecting ? 'Redirecting…' : 'Continue to Finaxis'}
      </Button>
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
        You will be redirected to your organization&apos;s secure identity service.
      </Typography>
    </Stack>
  );
}
