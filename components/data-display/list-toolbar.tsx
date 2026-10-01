'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { useListNavigation } from './use-list-navigation';

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
  | {
      kind: 'search';
      name: string;
      label: string;
      placeholder?: string;
    }
  | {
      kind: 'datetime';
      name: string;
      label: string;
      /** Stores the chosen minute's last millisecond (`:59.999Z`) instead of its first, for a
       * backend `le()` comparison on sub-second timestamps (an inclusive "To" would otherwise
       * exclude almost the whole minute the user picked). */
      endOfMinute?: boolean;
    };

export interface ToolbarChip {
  label: string;
  removeParam: string;
}

interface ListToolbarProps {
  fields: readonly ToolbarField[];
  resultLabel: string;
  chips?: readonly ToolbarChip[];
  /** The zone the table/drawer render times in (the organisation's, else UTC). Datetime fields
   * show a helper naming the browser's own zone whenever it differs, since entry stays in local
   * time. */
  timeZone: string;
}

const ALL = '';

function subscribeNever() {
  return () => undefined;
}

/** The browser's IANA zone, client-only: SSR has no notion of it, so the server snapshot is
 * `null` and the field renders with no helper text until hydration — never a mismatched string. */
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    subscribeNever,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

/** Converts a stored ISO instant to the `datetime-local` value in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Applies a datetime-local edit, called from both `onBlur` and Enter's `onKeyDown`:
 * - an empty value clears the filter, skipped when it is already clear;
 * - a value `new Date()` can't parse (e.g. a 5+-digit year, which HTML still accepts) is skipped
 *   rather than left to throw inside `toISOString()`;
 * - comparing the *local* forms (not ISO strings) skips a value that is the same instant in a
 *   different form — seconds `toLocalInput` already truncated, or a URL instant with no
 *   milliseconds — so tabbing through an unedited field never resets pagination;
 * - `endOfMinute` stores the chosen minute's last millisecond.
 */
function commitDatetime(
  field: Extract<ToolbarField, { kind: 'datetime' }>,
  rawValue: string,
  current: string,
  setParam: (name: string, value: string) => void,
): void {
  if (!rawValue) {
    if (current === '') return;
    setParam(field.name, '');
    return;
  }
  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return;
  if (rawValue === toLocalInput(current)) return;
  const iso = field.endOfMinute
    ? new Date(parsed.getTime() + 59_999).toISOString()
    : parsed.toISOString();
  setParam(field.name, iso);
}

/**
 * Free-text search, committed (trimmed) on Enter or blur — not per keystroke, so a commit never
 * races the text still being typed. Every URL change (a commit landing, "Clear filters",
 * Back/Forward) resets the draft to the URL value — React's "previous prop" pattern, so a cleared
 * URL never shows (or re-commits on blur) the old text.
 * ponytail: characters typed while a commit is in flight are replaced by the committed value;
 * add a debounce with a pending-commit guard if users expect live filtering.
 */
function SearchField({
  field,
  current,
  onCommit,
}: {
  field: Extract<ToolbarField, { kind: 'search' }>;
  current: string;
  onCommit: (value: string) => void;
}) {
  const [seen, setSeen] = useState(current);
  const [draft, setDraft] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setDraft(current);
  }
  const commit = (raw: string) => {
    const next = raw.trim();
    if (next !== current) onCommit(next);
  };
  return (
    <TextField
      type="search"
      label={field.label}
      placeholder={field.placeholder}
      value={draft}
      sx={{ width: { xs: '100%', sm: 260 } }}
      slotProps={{ htmlInput: { maxLength: 100 } }}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        // The native `type="search"` clear (×) fires this same event with an empty value — commit
        // it immediately rather than waiting for blur, or the (now empty) box and the still-filtered
        // results disagree (gate finding V9). `commit` itself still no-ops when already empty.
        if (next === '') commit(next);
      }}
      onBlur={(event) => {
        commit(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        commit(draft);
      }}
    />
  );
}

/** Filter bar (prototype `.toolbar`). Every change rewrites the URL and returns to page 0. */
export function ListToolbar({ fields, resultLabel, chips = [], timeZone }: ListToolbarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigateList = useListNavigation();
  const browserTimeZone = useBrowserTimeZone();
  const clearFiltersRef = useRef<HTMLAnchorElement>(null);

  const navigate = (update: (params: URLSearchParams) => void) => {
    navigateList((params) => {
      update(params);
      params.delete('page');
    });
  };

  const setParam = (name: string, value: string, clears: readonly string[] = []) => {
    navigate((params) => {
      if (value) params.set(name, value);
      else params.delete(name);
      for (const cleared of clears) params.delete(cleared);
    });
  };

  const removeChip = (param: string) => {
    // Otherwise removal drops focus to <body> — move it to a control that stays on the page.
    clearFiltersRef.current?.focus();
    setParam(param, '');
  };

  const zoneHelperText =
    browserTimeZone && browserTimeZone !== timeZone
      ? `Your local time (${browserTimeZone})`
      : undefined;

  return (
    <Box
      sx={{
        minHeight: 64,
        px: 3.5,
        py: 2.5,
        display: 'flex',
        flexWrap: 'wrap',
        // Top-aligned, not bottom-aligned: a datetime field's helper text (shown only when the
        // browser's zone differs from the page's) makes that field taller than a plain Select,
        // and flex-end would then misalign the input *boxes* by that helper's height even though
        // every field's label sits at the same position.
        alignItems: 'flex-start',
        gap: 2.5,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {fields.map((field) => {
        if (field.kind === 'select') {
          // A URL value parseAuditQuery dropped (unknown/invalid) isn't in `field.options` and
          // isn't applied to the query either — render it as ALL instead of a blank, out-of-range
          // Select. Safe generically: a value that *is* applied but narrowed out of a dependent
          // list (e.g. an action from another entity type) is appended to `options` by the
          // caller, so it never falls into this branch.
          const rawValue = searchParams.get(field.name) ?? ALL;
          const value =
            rawValue === ALL || field.options.some((option) => option.value === rawValue)
              ? rawValue
              : ALL;
          return (
            <FormControl key={field.name} sx={{ minWidth: 180 }}>
              <InputLabel id={`${field.name}-label`}>{field.label}</InputLabel>
              <Select
                labelId={`${field.name}-label`}
                label={field.label}
                value={value}
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
          );
        }
        if (field.kind === 'search') {
          return (
            <SearchField
              key={field.name}
              field={field}
              current={searchParams.get(field.name) ?? ''}
              onCommit={(value) => {
                setParam(field.name, value);
              }}
            />
          );
        }
        const current = searchParams.get(field.name) ?? '';
        return (
          <TextField
            // Uncontrolled; keyed on the URL value so "Clear filters" and chip removal reset it.
            key={`${field.name}:${current}`}
            type="datetime-local"
            label={field.label}
            sx={{ width: 210 }}
            defaultValue={toLocalInput(current)}
            helperText={zoneHelperText}
            onBlur={(event) => {
              commitDatetime(field, event.target.value, current, setParam);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // KeyboardEvent's `target` isn't narrowed to the input the way FocusEvent's is;
              // this checks at runtime instead of asserting the type away.
              if (!(event.target instanceof HTMLInputElement)) return;
              event.preventDefault();
              commitDatetime(field, event.target.value, current, setParam);
            }}
          />
        );
      })}
      {chips.map((chip) => (
        <Chip
          key={chip.removeParam}
          label={chip.label}
          onDelete={() => {
            removeChip(chip.removeParam);
          }}
          onClick={() => {
            removeChip(chip.removeParam);
          }}
          sx={{ alignSelf: 'center' }}
        />
      ))}
      <Link
        ref={clearFiltersRef}
        component={NextLink}
        href={pathname}
        sx={{ alignSelf: 'center', fontSize: '0.75rem', fontWeight: 700 }}
      >
        Clear filters
        <LinkPendingIndicator />
      </Link>
      <Typography
        variant="caption"
        color="text.secondary"
        role="status"
        sx={{ ml: 'auto', alignSelf: 'center' }}
      >
        {resultLabel}
      </Typography>
    </Box>
  );
}
