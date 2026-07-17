'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MuiLink from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

import { mockAuthenticate } from './mock-authenticate';
import { loginFormDefaultValues, loginFormSchema, type LoginFormValues } from './login-form.schema';

interface FormNotice {
  severity: 'success' | 'error' | 'info';
  message: string;
}

const FIELD_LABELS: Record<keyof LoginFormValues, string> = {
  identifier: 'Email or username',
  password: 'Password',
  rememberMe: 'Remember me',
};

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const identifierId = useId();
  const passwordId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: loginFormDefaultValues,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const { ref: identifierRef, ...identifierField } = register('identifier');
  const { ref: passwordRef, ...passwordField } = register('password');
  const { ref: rememberMeRef, ...rememberMeField } = register('rememberMe');

  const fieldIds: Partial<Record<keyof LoginFormValues, string>> = {
    identifier: identifierId,
    password: passwordId,
  };

  const errorEntries = (Object.keys(errors) as (keyof LoginFormValues)[])
    .filter((field) => errors[field])
    .map((field) => ({
      field,
      message: errors[field]?.message ?? '',
    }));

  const onSubmit: SubmitHandler<LoginFormValues> = async (values) => {
    setNotice(null);
    const result = await mockAuthenticate({
      identifier: values.identifier,
      password: values.password,
    });

    if (result.status === 'error') {
      setNotice({ severity: 'error', message: result.message });
      return;
    }

    setNotice({
      severity: 'success',
      message: 'The Finaxis UI foundation is ready. Authentication has not been connected yet.',
    });
  };

  const handleSsoClick = () => {
    setNotice({
      severity: 'info',
      message: 'Enterprise single sign-on is not connected yet.',
    });
  };

  return (
    <Box
      component="form"
      noValidate
      onSubmit={(event) => {
        void handleSubmit(onSubmit)(event);
      }}
      sx={{ width: '100%' }}
    >
      <Stack spacing={2.5}>
        {errorEntries.length > 0 && (
          <Alert severity="error" role="alert" variant="outlined">
            <Typography component="p" variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {errorEntries.length === 1
                ? 'There is 1 error in this form.'
                : `There are ${errorEntries.length} errors in this form.`}
            </Typography>
            <Stack component="ul" spacing={0.25} sx={{ pl: 2.5, m: 0 }}>
              {errorEntries.map(({ field, message }) => (
                <li key={field}>
                  <MuiLink
                    href={fieldIds[field] ? `#${fieldIds[field]}` : undefined}
                    underline="hover"
                  >
                    {FIELD_LABELS[field]}: {message}
                  </MuiLink>
                </li>
              ))}
            </Stack>
          </Alert>
        )}

        {notice && (
          <Alert
            severity={notice.severity}
            role={notice.severity === 'error' ? 'alert' : 'status'}
            variant="outlined"
          >
            {notice.message}
          </Alert>
        )}

        <TextField
          id={identifierId}
          label="Email or username"
          autoComplete="username"
          fullWidth
          inputRef={identifierRef}
          error={!!errors.identifier}
          helperText={errors.identifier?.message}
          slotProps={{ htmlInput: { 'aria-required': true } }}
          {...identifierField}
        />

        <TextField
          id={passwordId}
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          fullWidth
          inputRef={passwordRef}
          error={!!errors.password}
          helperText={errors.password?.message}
          slotProps={{
            htmlInput: { 'aria-required': true },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => {
                      setShowPassword((prev) => !prev);
                    }}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
          {...passwordField}
        />

        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <FormControlLabel
            control={
              <Checkbox slotProps={{ input: { ref: rememberMeRef } }} {...rememberMeField} />
            }
            label="Remember me"
          />
          <MuiLink component={Link} href="/forgot-password" variant="body2">
            Forgot password?
          </MuiLink>
        </Stack>

        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>

        <Button
          variant="outlined"
          size="large"
          fullWidth
          onClick={handleSsoClick}
          disabled={isSubmitting}
        >
          Continue with enterprise SSO
        </Button>
      </Stack>
    </Box>
  );
}
