import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAnywhere, canTenantWide, permissionHolder } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum, StatusChip } from '@/components/data-display/status-chip';
import { load, type Loaded } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import type { ProblemView } from '@/lib/api/problem';
import { formatInstant, shortId } from '@/lib/format';
import { makerLabel } from '@/modules/administration/approvals/components/request-facts';
import { scopedBranchView } from '@/modules/administration/branches/branch-rules';
import { listBranches } from '@/modules/administration/branches/branch-service';
import {
  roleAssignmentCount,
  scopedRoleAssignmentView,
} from '@/modules/administration/roles/role-rules';
import { EditMembershipButton } from '@/modules/administration/users/components/edit-membership-button';
import { OnboardingTimeline } from '@/modules/administration/users/components/onboarding-timeline';
import type { MembershipDetail } from '@/modules/administration/users/user-contract';
import {
  availableMembershipActions,
  branchAssignmentCount,
  canEditMembership,
  invitationFacts,
  onboardingProgress,
  parseUserId,
  primaryBranchHint,
  scopedAssignmentView,
  userStatusLabel,
  type SelectOption,
} from '@/modules/administration/users/user-rules';
import {
  countUserBranchAssignments,
  countUserRoleAssignments,
  getMembership,
  getUser,
} from '@/modules/administration/users/user-service';

interface UserOverviewPageProps {
  params: Promise<{ userId: string }>;
}

export default async function UserOverviewPage({ params }: UserOverviewPageProps) {
  const userId = parseUserId((await params).userId);
  if (!userId) notFound(); // rule 7: before any read, like the layout (16's tab pages)
  const [user, selected, timeZone, branches] = await Promise.all([
    load(getUser(userId)), // cached: the layout's read
    getCurrentContextProfile(),
    getOrganisationTimeZone(),
    getBranchIndex(),
  ]);
  if (!user.ok) return null; // the layout renders the failure

  const record = user.value;
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = permissionHolder(resolved?.profile);
  // BG-17: Edit membership, decided from the user read (it carries the status and the type), so
  // its Primary branch options are read beside the membership. ponytail: one page of 100 ACTIVE
  // branches by name, as the Assign-branch drawer reads them (AGENTS.md's fifth exception); a
  // branch-scoped `branch.view` lists its own (BG-03), and without one none are listed.
  const editable = canEditMembership(record, holder);
  // The membership by the id the user read carries (BG-09). null: not permitted (a count's row is
  // left out, the card says so). A Loaded failure: permitted, but the read failed.
  // The platform checks the membership read tenant-wide (BG-33), and the assignment search by user
  // against every branch a grant covers, whichever branch is selected (BG-03).
  const [membership, roleCount, branchCount, activeBranches] = await Promise.all([
    canTenantWide(holder, 'membership.view') ? load(getMembership(record.membershipId)) : null,
    can(holder, 'role_assignment.view') ? load(countUserRoleAssignments(record.id)) : null,
    canAnywhere(holder, 'branch_assignment.view')
      ? load(countUserBranchAssignments(record.id))
      : null,
    editable && canAnywhere(holder, 'branch.view')
      ? load(
          listBranches({
            status: 'ACTIVE',
            sort: { by: 'branchName', dir: 'ASC' },
            page: 0,
            size: 100,
          }),
        )
      : null,
  ]);
  // BG-11: where the identity provisioning stands, from the membership read (null: unknown).
  const invitation = membership?.ok ? membership.value.invitation?.status : undefined;
  // The reason says to retry only where the hero offers Retry provisioning (the layout's rule).
  const retryable = availableMembershipActions(
    { membershipStatus: record.membershipStatus, userStatus: record.userStatus, invitation },
    holder,
  ).includes('retry');
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };
  const branchLabel = (id: string) => {
    const branch = branches.get(id);
    return branch ? `${branch.name} (${branch.code})` : shortId(id);
  };
  const me = resolved?.profile.user_id ?? '';

  /** The card's Edit membership, on the membership as read: the user read decided the branch read,
   * and a membership revoked meanwhile offers nothing. */
  const editAction = (detail: MembershipDetail): ReactNode => {
    if (!editable || detail.type === 'SYSTEM' || detail.status === 'REVOKED') return undefined;
    const listed: SelectOption[] = activeBranches?.ok
      ? activeBranches.value.items.map((branch) => ({
          id: branch.id,
          label: `${branch.branchName} (${branch.branchCode})`,
        }))
      : [];
    // The current branch stays on offer when the page didn't list it (none listed, past the page,
    // out of a scoped view, or no longer ACTIVE), so keeping it sends nothing.
    const current = detail.primaryBranchId;
    // A failed read says so, apart from a holder with no `branch.view`, for whom none was made.
    let branchRead: 'listed' | 'failed' | 'unread' = 'unread';
    if (activeBranches) branchRead = activeBranches.ok ? 'listed' : 'failed';
    const options =
      current === null || listed.some((option) => option.id === current)
        ? listed
        : [...listed, { id: current, label: branchLabel(current) }].sort((a, b) =>
            a.label.localeCompare(b.label),
          );
    return (
      <EditMembershipButton
        membershipId={detail.id}
        userName={record.displayName}
        membershipType={detail.type}
        primaryBranchId={current}
        branches={options}
        branchHint={primaryBranchHint({
          read: branchRead,
          truncated: activeBranches?.ok === true && activeBranches.value.page.hasNext,
          scoped: scopedBranchView(holder),
        })}
        contextOrganisationId={resolved?.context.organization.id}
      />
    );
  };

  const profileItems: DescriptionItem[] = [
    { label: 'Display name', value: record.displayName },
    { label: 'Username', value: record.username },
    { label: 'Email', value: record.email },
    {
      label: 'User status',
      value: <StatusChip value={record.userStatus} label={userStatusLabel(record.userStatus)} />,
    },
    ...(roleCount
      ? [
          {
            label: 'Role assignments',
            value: roleCount.ok
              ? roleAssignmentCount(roleCount.value, scopedRoleAssignmentView(holder))
              : readFailed(roleCount.problem),
          },
        ]
      : []),
    ...(branchCount
      ? [
          {
            label: 'Branch assignments',
            value: branchCount.ok
              ? branchAssignmentCount(branchCount.value, scopedAssignmentView(holder))
              : readFailed(branchCount.problem),
          },
        ]
      : []),
    { label: 'User ID', value: <CopyIdButton value={record.id} label="User ID" /> },
  ];

  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <SectionCard title="Profile">
        <DescriptionList items={profileItems} />
      </SectionCard>
      <SectionCard
        title="Membership"
        actions={membership?.ok ? editAction(membership.value) : undefined}
      >
        {membershipBody(membership, { timeZone, at, branchLabel, me })}
      </SectionCard>
      <SectionCard title="Onboarding">
        <OnboardingTimeline
          progress={onboardingProgress(record.membershipStatus, record.userStatus, invitation)}
          facts={
            membership?.ok && membership.value.invitation
              ? invitationFacts(membership.value.invitation, timeZone, { retryable })
              : []
          }
        />
      </SectionCard>
    </Box>
  );
}

const MUTED_PARAGRAPH_SX = { color: 'text.secondary', px: 4.5, py: 3.5 } as const;

/** A fact whose read failed: said so, with the request reference when there is one, never the
 * backend's own text. A fact the holder isn't permitted to read is left out instead. */
function readFailed(problem: ProblemView): ReactNode {
  return (
    <>
      {"Couldn't be loaded"}
      {problem.requestId && (
        <Typography
          variant="caption"
          component="span"
          sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}
        >
          Reference: {problem.requestId}
        </Typography>
      )}
    </>
  );
}

/** The Membership card's body: each way the read can fall short says so, never an empty card. */
function membershipBody(
  membership: Loaded<MembershipDetail> | null,
  {
    timeZone,
    at,
    branchLabel,
    me,
  }: {
    timeZone: string;
    at: (iso: string) => string;
    branchLabel: (id: string) => string;
    /** The signed-in user's id: their own invitation reads "You (…)". */
    me: string;
  },
): ReactNode {
  if (membership === null) {
    return (
      <Typography variant="body2" sx={MUTED_PARAGRAPH_SX}>
        {"You can't view membership details in your current role."}
      </Typography>
    );
  }
  if (!membership.ok) return <ErrorState problem={membership.problem} />;

  const { value } = membership;
  return (
    <DescriptionList
      items={[
        // BG-17 (ADR 0040): taken at the first activation and kept for life; none before it.
        { label: 'Member no.', value: value.memberNumber ?? '—' },
        { label: 'Membership type', value: humanizeEnum(value.type) },
        { label: 'Membership status', value: <StatusChip value={value.status} /> },
        {
          label: 'Primary branch',
          value: value.primaryBranchId ? branchLabel(value.primaryBranchId) : 'None',
        },
        // BG-08: the membership's `created_by`, the re-inviter after a re-invite, so "Last": beside
        // "First invited" (a kept `created_at`) a bare "Invited by" would date the re-invite to the
        // first. "—" for the system or someone the caller may not see.
        { label: 'Last invited by', value: makerLabel(value.createdBy, me) },
        // A re-invite keeps the membership's `created_at` (spec §6.3), so it is the first invitation.
        { label: `First invited (${timeZone})`, value: at(value.createdAt) },
        { label: `Updated (${timeZone})`, value: at(value.updatedAt) },
        { label: 'Membership ID', value: <CopyIdButton value={value.id} label="Membership ID" /> },
      ]}
    />
  );
}
