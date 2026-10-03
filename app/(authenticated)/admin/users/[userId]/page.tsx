import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum, StatusChip } from '@/components/data-display/status-chip';
import { load, type Loaded } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone } from '@/lib/api/lookups';
import { formatInstant, shortId } from '@/lib/format';
import { OnboardingTimeline } from '@/modules/administration/users/components/onboarding-timeline';
import type {
  MembershipDetail,
  MembershipSummary,
} from '@/modules/administration/users/user-contract';
import {
  branchAssignmentCount,
  onboardingProgress,
  parseUserId,
  userStatusLabel,
} from '@/modules/administration/users/user-rules';
import {
  countUserRoleAssignments,
  findUserMembership,
  getMembership,
  getUser,
  listUserBranchAssignments,
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
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const selectedBranch = selected.kind === 'resolved' ? selected.context.branch : null;
  const [membership, roleCount, scan] = await Promise.all([
    can(holder, 'membership.view') ? load(findUserMembership(record.id, record.email)) : null,
    can(holder, 'role_assignment.view') ? countUserRoleAssignments(record.id) : null,
    can(holder, 'branch_assignment.view') ? load(listUserBranchAssignments(record.id)) : null,
  ]);
  const detail =
    membership?.ok && membership.value ? await load(getMembership(membership.value.id)) : null;
  const at = (iso: string) => {
    const when = formatInstant(iso, timeZone);
    return `${when.date} · ${when.time}`;
  };

  const profileItems: DescriptionItem[] = [
    { label: 'Display name', value: record.displayName },
    { label: 'Username', value: record.username },
    { label: 'Email', value: record.email },
    {
      label: 'User status',
      value: <StatusChip value={record.userStatus} label={userStatusLabel(record.userStatus)} />,
    },
    ...(roleCount === null ? [] : [{ label: 'Role assignments', value: String(roleCount) }]),
    ...(scan?.ok
      ? [
          {
            label: 'Branch assignments',
            value: branchAssignmentCount(
              scan.value.items.length,
              scan.value.truncated,
              selectedBranch?.name ?? null,
            ),
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
      <SectionCard title="Membership">
        {membershipBody(membership, detail, branches, timeZone, at)}
      </SectionCard>
      <SectionCard title="Onboarding">
        <OnboardingTimeline
          progress={onboardingProgress(record.membershipStatus, record.userStatus)}
        />
      </SectionCard>
    </Box>
  );
}

const MUTED_PARAGRAPH_SX = { color: 'text.secondary', px: 4.5, py: 3.5 } as const;

/** The Membership card's body: each way the read can fall short says so, never an empty card. */
function membershipBody(
  membership: Loaded<MembershipSummary | null> | null,
  detail: Loaded<MembershipDetail> | null,
  branches: ReadonlyMap<string, { name: string; code: string }>,
  timeZone: string,
  at: (iso: string) => string,
): ReactNode {
  if (membership === null) {
    return (
      <Typography variant="body2" sx={MUTED_PARAGRAPH_SX}>
        {"You can't view membership details in your current role."}
      </Typography>
    );
  }
  if (!membership.ok) return <ErrorState problem={membership.problem} />;
  if (detail === null) {
    return (
      <Typography variant="body2" sx={MUTED_PARAGRAPH_SX}>
        {"This user's membership couldn't be found."}
      </Typography>
    );
  }
  if (!detail.ok) return <ErrorState problem={detail.problem} />;

  const { value } = detail;
  const branch = value.primaryBranchId ? branches.get(value.primaryBranchId) : undefined;
  let primaryBranch = 'None';
  if (value.primaryBranchId) {
    primaryBranch = branch ? `${branch.name} (${branch.code})` : shortId(value.primaryBranchId);
  }
  return (
    <DescriptionList
      items={[
        { label: 'Membership type', value: humanizeEnum(value.type) },
        { label: 'Membership status', value: <StatusChip value={value.status} /> },
        { label: 'Primary branch', value: primaryBranch },
        { label: `Created (${timeZone})`, value: at(value.createdAt) },
        { label: `Updated (${timeZone})`, value: at(value.updatedAt) },
        { label: 'Membership ID', value: <CopyIdButton value={value.id} label="Membership ID" /> },
      ]}
    />
  );
}
