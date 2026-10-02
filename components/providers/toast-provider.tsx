'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import type { AlertColor } from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

type Notify = (message: string, severity?: AlertColor) => void;

const ToastContext = createContext<Notify | null>(null);

interface Toast {
  id: number;
  message: string;
  severity: AlertColor;
}

/**
 * One transient outcome message at a time (prototype `.toast`). The Alert keeps MUI's default
 * `role="alert"`, announced by screen readers as soon as it's inserted — an explicit
 * `role="status"` here would enter the DOM already holding its text, which a polite live region
 * does not reliably announce (VoiceOver especially).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback<Notify>((message, severity = 'success') => {
    setToast({ id: Date.now(), message, severity });
  }, []);
  const close = () => {
    setToast(null);
  };

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <Snackbar
        key={toast?.id}
        open={toast !== null}
        autoHideDuration={5000}
        onClose={(_event, reason) => {
          if (reason !== 'clickaway') close();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {toast ? (
          <Alert severity={toast.severity} variant="filled" onClose={close}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) {
    throw new Error('useToast must be used within a ToastProvider.');
  }
  return notify;
}
