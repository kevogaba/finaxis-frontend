'use client';

import Alert from '@mui/material/Alert';

const STATUS_MESSAGES: Record<string, string> = {
  'error:authentication_failed': "We couldn't sign you in. Please try again.",
  'reason:session_expired': 'Your session has expired. Please sign in again.',
  'reason:logged_out': 'You have been signed out.',
};

interface LoginStatusAlertProps {
  error?: string;
  reason?: string;
}

export function LoginStatusAlert({ error, reason }: LoginStatusAlertProps) {
  const key = error ? `error:${error}` : reason ? `reason:${reason}` : undefined;
  const message = key ? STATUS_MESSAGES[key] : undefined;

  if (!message) {
    return null;
  }

  return (
    <Alert severity={reason === 'logged_out' ? 'info' : 'warning'} role="status" sx={{ mb: 3 }}>
      {message}
    </Alert>
  );
}
