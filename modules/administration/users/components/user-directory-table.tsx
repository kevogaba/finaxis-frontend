import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import NextLink from '@/components/navigation/next-link';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { StatusChip } from '@/components/data-display/status-chip';
import { TruncatedText } from '@/components/data-display/truncated-text';
import { initialsOf } from '@/components/shell/initials';
import type { UserSummary } from '../user-contract';
import { onboardingState } from '../user-rules';

const COLUMNS = ['User', 'Username', 'Onboarding', 'Membership', 'User status'] as const;

interface UserDirectoryTableProps {
  users: readonly UserSummary[];
}

/** The users directory (spec §10.5): newest first as the backend returns it, so no header sorts
 * (the endpoint has no sort, contract §E.3). Rows carry no hover highlight, since only the name
 * link navigates. */
export function UserDirectoryTable({ users }: UserDirectoryTableProps) {
  return (
    <TableContainer sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}>
      <Table stickyHeader aria-label="Users" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map((label) => (
              <TableCell key={label}>{label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const onboarding = onboardingState(user.membershipStatus, user.userStatus);
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
                    <Avatar
                      aria-hidden
                      sx={{
                        width: 32,
                        height: 32,
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        bgcolor: 'avatar.bg',
                        color: 'avatar.fg',
                      }}
                    >
                      {initialsOf(user.displayName)}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Link
                        component={NextLink}
                        href={`/admin/users/${user.id}`}
                        variant="body2"
                        noWrap
                        title={user.displayName}
                        sx={{ display: 'block', maxWidth: 320, fontWeight: 700 }}
                      >
                        {user.displayName}
                        <LinkPendingIndicator />
                      </Link>
                      <TruncatedText
                        value={user.email}
                        maxWidth={320}
                        variant="caption"
                        color="textSecondary"
                      />
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {user.username}
                  </Typography>
                </TableCell>
                <TableCell>
                  <StatusChip
                    value={onboarding.key}
                    label={onboarding.label}
                    tone={onboarding.tone}
                  />
                </TableCell>
                <TableCell>
                  <StatusChip value={user.membershipStatus} />
                </TableCell>
                <TableCell>
                  <StatusChip value={user.userStatus} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
