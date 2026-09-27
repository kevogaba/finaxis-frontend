'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';

export type ToolbarField =
  | {
      kind: 'select';
      name: string;
      label: string;
      allLabel: string;
      options: readonly { value: string; label: string }[];
      /** Params to delete in the same navigation when this field changes (e.g. a stale
       * dependent filter that would otherwise leave an out-of-range Select value). */
      clears?: readonly string[];
    }
  | { kind: 'datetime'; name: string; label: string };

export interface ToolbarChip {
  label: string;
  removeParam: string;
}

interface ListToolbarProps {
  fields: readonly ToolbarField[];
  resultLabel: string;
  chips?: readonly ToolbarChip[];
}

const ALL = '';

/** Converts a stored ISO instant to the `datetime-local` value in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Filter bar (prototype `.toolbar`). Every change rewrites the URL and returns to page 0. */
export function ListToolbar({ fields, resultLabel, chips = [] }: ListToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = (update: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    params.delete('page');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const setParam = (name: string, value: string, clears: readonly string[] = []) => {
    navigate((params) => {
      if (value) params.set(name, value);
      else params.delete(name);
      for (const cleared of clears) params.delete(cleared);
    });
  };

  return (
    <Box
      sx={{
        minHeight: 64,
        px: 3.5,
        py: 2.5,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: 2.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {fields.map((field) =>
        field.kind === 'select' ? (
          <FormControl key={field.name} sx={{ minWidth: 180 }}>
            <InputLabel id={`${field.name}-label`}>{field.label}</InputLabel>
            <Select
              labelId={`${field.name}-label`}
              label={field.label}
              value={searchParams.get(field.name) ?? ALL}
              displayEmpty
              onChange={(event) => {
                setParam(field.name, event.target.value, field.clears);
              }}
            >
              <MenuItem value={ALL}>{field.allLabel}</MenuItem>
              {field.options.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : (
          <TextField
            // Uncontrolled; keyed on the URL value so "Clear filters" and chip removal reset it.
            key={`${field.name}:${searchParams.get(field.name) ?? ''}`}
            type="datetime-local"
            label={field.label}
            sx={{ width: 210 }}
            defaultValue={toLocalInput(searchParams.get(field.name))}
            onBlur={(event) => {
              const value = event.target.value;
              const next = value ? new Date(value).toISOString() : '';
              // Skip the navigation when nothing changed — otherwise tabbing through From/To
              // resets `page` on every stop, not only on an actual edit.
              if (next === (searchParams.get(field.name) ?? '')) return;
              setParam(field.name, next);
            }}
          />
        ),
      )}
      {chips.map((chip) => (
        <Chip
          key={chip.removeParam}
          label={chip.label}
          onDelete={() => {
            setParam(chip.removeParam, '');
          }}
          sx={{ alignSelf: 'center' }}
        />
      ))}
      <Link
        component={NextLink}
        href={pathname}
        sx={{ alignSelf: 'center', fontSize: '0.75rem', fontWeight: 700 }}
      >
        Clear filters
      </Link>
      <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', alignSelf: 'center' }}>
        {resultLabel}
      </Typography>
    </Box>
  );
}
