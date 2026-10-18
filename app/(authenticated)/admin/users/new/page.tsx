import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { getCurrentContextProfile } from '@/auth/context-service';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import type { ProblemView } from '@/lib/api/problem';
import { listBranches } from '@/modules/administration/branches/branch-service';
import { listRoles } from '@/modules/administration/roles/role-service';
import { InviteUserWizard } from '@/modules/administration/users/components/invite-user-wizard';
import {
  canInviteUsers,
  INVITE_FORBIDDEN,
  NO_ACTIVE_BRANCHES,
  OPTION_CEILING,
} from '@/modules/administration/users/invite-rules';
import { NO_ACTIVE_ROLES } from '@/modules/administration/users/user-rules';

export const metadata: Metadata = { title: 'Invite user' };

/** A read the page can't go on without: forbidden says so, anything else with its reference. */
function failed(problem: ProblemView): ReactNode {
  return problem.code === 'forbidden' ? <ForbiddenState /> : <ErrorState problem={problem} />;
}

/** Nothing to offer: the way to fix it, instead of a wizard that can't be finished. */
function nothingToOffer(message: string, href: string, action: string): ReactNode {
  return (
    <Box sx={{ p: 6, display: 'grid', gap: 3, justifyItems: 'start' }}>
      <Typography>{message}</Typography>
      <Button component={NextLink} href={href} variant="outlined">
        {action}
      </Button>
    </Box>
  );
}

export default async function InviteUserPage() {
  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const header = (
    <PageHeader
      eyebrow="Administration · Users & access"
      title="Invite user"
      description="Give someone a membership in this institution. A different administrator approves it before they can use this institution."
    />
  );
  const withHeader = (content: ReactNode) => (
    <>
      {header}
      <Paper>{content}</Paper>
    </>
  );

  // Ruling 4: every code the wizard needs, before any read; no half-working wizard.
  if (!canInviteUsers({ permissions: resolved?.profile.permissions ?? [] })) {
    return withHeader(<ForbiddenState description={INVITE_FORBIDDEN} />);
  }

  // ponytail: one page of 100 ACTIVE roles and branches each, by name; past it the wizard says so
  // (AGENTS.md's eighth paging exception; Ruling 10).
  const [roles, branches] = await Promise.all([
    load(
      listRoles({
        status: 'ACTIVE',
        sort: { by: 'roleName', dir: 'ASC' },
        page: 0,
        size: OPTION_CEILING,
      }),
    ),
    load(
      listBranches({
        status: 'ACTIVE',
        sort: { by: 'branchName', dir: 'ASC' },
        page: 0,
        size: OPTION_CEILING,
      }),
    ),
  ]);
  if (!roles.ok) return withHeader(failed(roles.problem));
  if (!branches.ok) return withHeader(failed(branches.problem));
  if (roles.value.items.length === 0) {
    return withHeader(nothingToOffer(NO_ACTIVE_ROLES, '/admin/roles', 'Open Roles & permissions'));
  }
  if (branches.value.items.length === 0) {
    return withHeader(nothingToOffer(NO_ACTIVE_BRANCHES, '/admin/branches', 'Open Branches'));
  }

  return (
    <>
      {header}
      <InviteUserWizard
        roles={roles.value.items.map((role) => ({
          id: role.id,
          label: `${role.roleName} (${role.roleCode})`,
        }))}
        branches={branches.value.items.map((branch) => ({
          id: branch.id,
          label: `${branch.branchName} (${branch.branchCode})`,
        }))}
        rolesCapped={roles.value.page.hasNext}
        branchesCapped={branches.value.page.hasNext}
        contextOrganisationId={resolved?.context.organization.id}
      />
    </>
  );
}
