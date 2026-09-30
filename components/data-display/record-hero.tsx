import type { ReactNode } from 'react';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { initialsOf } from '@/components/shell/initials';

/** A person gets initials in a circle; anything else an icon in a rounded square (prototype
 * `.record-avatar`). */
export type RecordAvatar = { kind: 'person'; name: string } | { kind: 'icon'; icon: ReactNode };

interface RecordHeroProps {
  /** e.g. `{ href: '/admin/branches', label: 'Back to branches' }`. */
  back?: { href: string; label: string };
  avatar: RecordAvatar;
  /** e.g. `Administration · Branch record`. */
  eyebrow: string;
  /** The page's only h1. */
  title: string;
  subtitle?: string;
  /** Status chips, e.g. `<StatusChip value={branch.status} />`. */
  status?: ReactNode;
  /** Hero actions — client components (dialog triggers) passed as elements. */
  actions?: ReactNode;
}

/**
 * Record page header (prototype `.record-hero`, spec §9): back link, identity, status, actions.
 * Server-Component-safe — every slot is an element, never a callback.
 */
export function RecordHero({
  back,
  avatar,
  eyebrow,
  title,
  subtitle,
  status,
  actions,
}: RecordHeroProps) {
  const person = avatar.kind === 'person';
  return (
    <>
      {back && (
        <Link
          component={NextLink}
          href={back.href}
          underline="hover"
          sx={{
            minHeight: 36,
            mb: 2.5,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1.75,
            fontWeight: 700,
          }}
        >
          <ArrowBack fontSize="small" />
          {back.label}
        </Link>
      )}
      <Paper
        sx={{
          minHeight: 112,
          px: 5,
          py: 4.5,
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <Box
          sx={{ minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3.75 }}
        >
          <Avatar
            aria-hidden
            variant={person ? 'circular' : 'rounded'}
            sx={{
              width: 58,
              height: 58,
              fontSize: '1.125rem',
              fontWeight: 800,
              borderRadius: person ? undefined : 2,
              bgcolor: person ? 'avatar.bg' : 'status.infoBg',
              color: person ? 'avatar.fg' : 'primary.main',
            }}
          >
            {person ? initialsOf(avatar.name) : avatar.icon}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
            <Typography variant="overline" component="p" color="text.secondary">
              {eyebrow}
            </Typography>
            <Typography component="h1" variant="h2" sx={{ my: 1, overflowWrap: 'anywhere' }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {status && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>{status}</Box>}
        </Box>
        {actions && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 2,
              // Prototype ≤ md: actions take the full row and share it.
              '& > *': { flexGrow: { xs: 1, md: 0 } },
            }}
          >
            {actions}
          </Box>
        )}
      </Paper>
    </>
  );
}
