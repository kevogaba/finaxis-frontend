'use client';

import { useEffect, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { tenantUserOptionPageSchema, type TenantUserOption } from '../user-option';

interface UserPickerProps {
  /** The hidden input carrying the chosen user's id into the form's FormData. */
  name: string;
  label: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  onChange?: (user: TenantUserOption | null) => void;
}

class SearchFailed extends Error {
  constructor(readonly status: number) {
    super(`User search failed with status ${status}.`);
    this.name = 'SearchFailed';
  }
}

async function searchUsers(q: string, signal: AbortSignal): Promise<readonly TenantUserOption[]> {
  const response = await fetch(`/api/tenant/users?${new URLSearchParams({ q }).toString()}`, {
    signal,
  });
  if (!response.ok) throw new SearchFailed(response.status);
  return tenantUserOptionPageSchema.parse(await response.json()).items;
}

const SEARCH_DELAY_MS = 300;

/** Tenant user search (spec §9 assignment drawer, §10.1 actor filter): first 10 matches only. */
export function UserPicker({
  name,
  label,
  required,
  error,
  helperText,
  onChange,
}: UserPickerProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<TenantUserOption | null>(null);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<readonly TenantUserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      searchUsers(input.trim(), controller.signal)
        .then((items) => {
          setOptions(items);
          setFailure(null);
        })
        .catch((caught: unknown) => {
          if (controller.signal.aborted) return;
          setOptions([]);
          setFailure(
            caught instanceof SearchFailed && caught.status === 401
              ? 'Your session has expired. Sign in again.'
              : "Couldn't search users. Try again.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, open]);

  return (
    <>
      <Autocomplete
        open={open}
        onOpen={() => {
          setOpen(true);
        }}
        onClose={() => {
          setOpen(false);
        }}
        options={options}
        value={value}
        loading={loading}
        // The backend already filtered by `q`.
        filterOptions={(all) => all}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        getOptionLabel={(option) => option.displayName}
        noOptionsText={
          failure ?? (input.trim() ? 'No matching users' : 'Type a name, username, or email')
        }
        onInputChange={(_event, next) => {
          setInput(next);
        }}
        onChange={(_event, next) => {
          setValue(next);
          onChange?.(next);
        }}
        renderOption={({ key, ...optionProps }, option) => (
          <Box component="li" key={key} {...optionProps}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>
                {option.displayName}
              </Typography>
              <Typography variant="caption" component="p" color="text.secondary" noWrap>
                {option.email}
              </Typography>
            </Box>
          </Box>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            required={required}
            error={Boolean(error)}
            helperText={error ?? helperText}
          />
        )}
      />
      <input type="hidden" name={name} value={value?.id ?? ''} />
    </>
  );
}
