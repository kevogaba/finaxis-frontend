// Server-only: `rowActions` is a render prop, which can never cross to a Client Component.
import 'server-only';
import type { ReactNode } from 'react';
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
import type { InvitationStatus, UserSummary } from '../user-contract';
import { onboardingState, userStatusLabel } from '../user-rules';

const COLUMNS = ['User', 'Username', 'Onboarding', 'Membership', 'User status'] as const;
// At most 320 px, and at most 60% of the viewport: at 375 px the card shows about 300 px, so a fixed
// 320 px cut a long name or email off at the card's edge with its ellipsis out of sight.
const NAME_MAX_WIDTH = 'min(320px, 60vw)';

interface UserDirectoryTableProps {
  users: readonly UserSummary[];
  /** Where a user's record lives: 10's own by default; layer 17 passes the platform's. */
  basePath?: string;
  /** BG-28: the `invitation` of rows that await an identity, by user id (`readRowInvitations`), so
   * a re-invited member reads Awaiting approval. A row without one keeps its status-only label. */
  invitations?: Readonly<Record<string, InvitationStatus>>;
  /** A last "Actions" column, a row's own controls (the platform checker's Approve, BG-02). Server
   * Component: this function prop never crosses to the client — keep it that way. */
  rowActions?: (user: UserSummary) => ReactNode;
}

/** The users directory (spec §10.5): newest first as the backend returns it, so no header sorts
 * (the endpoint has no sort, contract §E.3). Rows carry no hover highlight, since only the name
 * link navigates. */
export function UserDirectoryTable({
  users,
  basePath = '/admin/users',
  invitations = {},
  rowActions,
}: UserDirectoryTableProps) {
  return (
    // Keyboard-scrollable at 375 px, where the 760 px table overflows (07's history-table rule, as in
    // the branch assignments table). Not "Users": the table keeps that name, and a landmark and a
    // table sharing it would read twice; no other region on the page is named "Users table".
    <TableContainer
      tabIndex={0}
      role="region"
      aria-label="Users table"
      sx={{ maxHeight: { md: 'calc(100dvh - 300px)' }, minHeight: 240 }}
    >
      <Table stickyHeader aria-label="Users" sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow>
            {COLUMNS.map((label) => (
              <TableCell key={label}>{label}</TableCell>
            ))}
            {rowActions && <TableCell>Actions</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => {
            const onboarding = onboardingState(
              user.membershipStatus,
              user.userStatus,
              invitations[user.id],
            );
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
                        href={`${basePath}/${user.id}`}
                        variant="body2"
                        noWrap
                        title={user.displayName}
                        sx={{ display: 'block', maxWidth: NAME_MAX_WIDTH, fontWeight: 700 }}
                      >
                        {user.displayName}
                        <LinkPendingIndicator />
                      </Link>
                      <TruncatedText
                        value={user.email}
                        maxWidth={NAME_MAX_WIDTH}
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
                  <StatusChip value={user.userStatus} label={userStatusLabel(user.userStatus)} />
                </TableCell>
                {rowActions && <TableCell>{rowActions(user)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
