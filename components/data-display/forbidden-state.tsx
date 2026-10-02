import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LockOutlined from '@mui/icons-material/LockOutlined';
import { ALL_BRANCHES_UNAVAILABLE } from '@/components/context/all-branches-copy';
import { SwitchToAllBranchesButton } from '@/components/context/switch-to-all-branches-button';

interface ForbiddenStateProps {
  title?: string;
  description?: string;
  /** e.g. a switch-context button. */
  action?: ReactNode;
}

/**
 * Inline "no permission" or "wrong context" state (spec §6.7), shown in place of the content —
 * never an error page. For approve/activate, pass the maker-checker explanation.
 */
export function ForbiddenState({
  title = "You don't have permission",
  description = "Your role doesn't include this in the current context. Ask an administrator if you need access.",
  action,
}: ForbiddenStateProps) {
  return (
    <Box
      sx={{
        minHeight: 240,
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        p: 6,
        textAlign: 'center',
        color: 'text.secondary',
      }}
    >
      <LockOutlined sx={{ fontSize: 34 }} aria-hidden="true" />
      <Typography component="p" variant="h5" color="text.primary">
        {title}
      </Typography>
      <Typography variant="body2" sx={{ maxWidth: 480 }}>
        {description}
      </Typography>
      {action}
    </Box>
  );
}

interface BranchContextStateProps {
  /**
   * `false` when the user has at most one distinct assigned branch, so All branches can't work:
   * `resolved.profile.branches.length > 1` from `/auth/me` (already de-duplicated). Defaults to
   * `true`. The button still handles stale data.
   */
  allBranchesAvailable?: boolean;
}

/** Spec §6.5: the current branch context can't reach the branch this page needs — offered instead
 * of a raw 404. Index Review Focus 3: never offer a meaningless "All branches". */
export function BranchContextState({ allBranchesAvailable = true }: BranchContextStateProps) {
  if (!allBranchesAvailable) {
    return <ForbiddenState description={ALL_BRANCHES_UNAVAILABLE} />;
  }
  return (
    <ForbiddenState
      title="Switch to All branches to manage this branch"
      description="With a branch selected, you can only reach that branch. Switch to All branches (institution level) to reach other branches, including drafts and branches awaiting approval, if your role allows it."
      action={<SwitchToAllBranchesButton />}
    />
  );
}
