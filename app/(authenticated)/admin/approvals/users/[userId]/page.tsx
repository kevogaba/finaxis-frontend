import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, permissionHolder } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList } from '@/components/data-display/description-list';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { humanizeEnum, StatusChip } from '@/components/data-display/status-chip';
import NextLink from '@/components/navigation/next-link';
import { PageHeader } from '@/components/shell/page-header';
import { load, type Loaded } from '@/lib/api/load';
import { getBranchIndex, getOrganisationTimeZone, getRoleIndex } from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import { userControlChecks } from '@/modules/administration/approvals/approval-checks';
import {
  CHECKS_DESCRIPTION,
  REQUEST_DESCRIPTION,
  USER_APPROVAL_EYEBROW,
  USER_APPROVAL_FORBIDDEN,
  USER_REQUEST,
} from '@/modules/administration/approvals/approval-copy';
import {
  availableUserDecisions,
  blockedUserDecisions,
  canSeeUserApprovals,
  USER_QUEUE_HREF,
  userApprovalState,
  userOutcomeNote,
} from '@/modules/administration/approvals/approval-rules';
import { listRequestedRoles } from '@/modules/administration/approvals/approval-service';
import { ControlChecks } from '@/modules/administration/approvals/components/control-checks';
import { DecisionBar } from '@/modules/administration/approvals/components/decision-bar';
import { makerLabel } from '@/modules/administration/approvals/components/request-facts';
import { RequestedAccess } from '@/modules/administration/approvals/components/requested-access';
import {
  isMaker,
  makerGate,
  SELF_APPROVAL_NOTE_USERS,
} from '@/modules/administration/approvals/maker-checker';
import { readMakerCheckerSwitch } from '@/modules/administration/settings/settings-service';
import type { MembershipSummary } from '@/modules/administration/users/user-contract';
import {
  membershipActionsNote,
  onboardingState,
  parseUserId,
  userStatusLabel,
} from '@/modules/administration/users/user-rules';
import {
  findUserMembership,
  getUser,
  listUserBranchAssignments,
} from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'User approval' };

interface UserApprovalPageProps {
  params: Promise<{ userId: string }>;
}

/** 10's membership lookup outcome (its Ruling 7): a miss within the ceiling isn't a failure. */
function lookupOutcome(
  membership: Loaded<MembershipSummary | null> | null,
): 'found' | 'missing' | 'failed' {
  if (membership?.ok === false) return 'failed';
  return membership?.value ? 'found' : 'missing';
}

/** A user's onboarding approval (spec §10.6): the request, the person, the access they get, the
 * control checks, and the decision bar (Rulings 5–8, 10, 12). */
export default async function UserApprovalPage({ params }: UserApprovalPageProps) {
  // Rule 7: the id is checked, and canonicalised, before any read (10's parser).
  const userId = parseUserId((await params).userId);
  if (!userId) notFound();

  const selected = await getCurrentContextProfile();
  const resolved = selected.kind === 'resolved' ? selected : null;
  const holder = resolved ? permissionHolder(resolved.profile) : { permissions: [] };
  const failure = (content: ReactNode) => (
    <>
      <PageHeader eyebrow={USER_APPROVAL_EYEBROW} title="User approval" />
      <Paper>{content}</Paper>
    </>
  );
  if (!resolved || !canSeeUserApprovals(holder)) {
    return failure(<ForbiddenState description={USER_APPROVAL_FORBIDDEN} />);
  }

  const user = await load(getUser(userId));
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return failure(
      user.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={user.problem} />
      ),
    );
  }

  const record = user.value;
  // The backend's ids, never the URL's (Ruling 5): `record.id` for every read, `/auth/me`'s for me.
  const me = resolved.profile.user_id;
  const selectedBranch = resolved.context.branch;
  const state = userApprovalState(record.membershipStatus, record.userStatus);
  // BG-08: the inviter is the record's own `created_by`; the switch is read only for them.
  const makers = [record.createdBy?.id];
  // Each read only with its own code; load() redirects on a lost session or a stale context, and
  // any other failure is shown where its fact would be (rule 9).
  const [membership, roles, scan, roleIndex, branchIndex, timeZone, switchState] =
    await Promise.all([
      can(holder, 'membership.view') ? load(findUserMembership(record.id, record.email)) : null,
      can(holder, 'role_assignment.view') ? load(listRequestedRoles(record.id)) : null,
      can(holder, 'branch_assignment.view') ? load(listUserBranchAssignments(record.id)) : null,
      getRoleIndex(), // empty without role.view: names fall back to short ids
      getBranchIndex(), // empty without branch.view: names fall back to short ids
      getOrganisationTimeZone(),
      isMaker(makers, me) ? readMakerCheckerSwitch('user_invites', holder) : ('unknown' as const),
    ]);

  const membershipId = membership?.ok ? (membership.value?.id ?? null) : null;
  const decisions = membershipId ? availableUserDecisions(state, holder) : [];
  const gate = makerGate({ makerIds: makers, callerId: me, switchState });
  const blocked = blockedUserDecisions(decisions, {
    state,
    userStatus: record.userStatus,
    makerGate: gate,
  });
  const warning =
    decisions.includes('approve') && !blocked.approve && gate === 'allowed-self-approval'
      ? SELF_APPROVAL_NOTE_USERS
      : null;
  const outcome = userOutcomeNote(state, record.membershipStatus);
  const note = outcome === null ? membershipActionsNote(holder, lookupOutcome(membership)) : null;
  const onboarding = onboardingState(record.membershipStatus, record.userStatus);
  const invitedAt = formatInstant(record.membershipCreatedAt, timeZone);

  return (
    <>
      <RecordHero
        back={{ href: USER_QUEUE_HREF, label: 'Back to user onboarding' }}
        avatar={{ kind: 'person', name: record.displayName }}
        eyebrow={USER_APPROVAL_EYEBROW}
        title={record.displayName}
        subtitle={`${record.username} · ${record.email}`}
        status={
          <>
            <StatusChip value={onboarding.key} label={onboarding.label} tone={onboarding.tone} />
            <StatusChip
              value={record.membershipStatus}
              label={`Membership ${humanizeEnum(record.membershipStatus).toLowerCase()}`}
            />
          </>
        }
        actions={
          // Undefined, not an empty component: RecordHero renders its actions box when truthy.
          decisions.length > 0 || note ? (
            <DecisionBar
              subject={{ kind: 'membership', membershipId }}
              name={record.displayName}
              decisions={decisions}
              blocked={blocked}
              note={note}
              warning={warning}
              contextOrganisationId={resolved.context.organization.id}
            />
          ) : undefined
        }
      />
      <Box sx={{ display: 'grid', gap: 3, mt: 4 }}>
        {outcome && (
          <Alert severity="info" role="note">
            {outcome}{' '}
            <Link component={NextLink} href={`/admin/users/${record.id}`} underline="always">
              Open their user record
            </Link>
          </Alert>
        )}
        <SectionCard
          title="Request"
          description={REQUEST_DESCRIPTION}
          actions={
            can(holder, 'audit.view') ? (
              <Link component={NextLink} href={`/admin/users/${record.id}/audit`}>
                Open the audit trail
              </Link>
            ) : undefined
          }
        >
          <DescriptionList
            items={[
              { label: 'Request', value: USER_REQUEST },
              { label: 'Institution', value: resolved.context.organization.name },
              { label: 'Invited by', value: makerLabel(record.createdBy, me) },
              {
                // The membership's creation, which a re-invite keeps: the first invitation.
                label: `First invited (${timeZone})`,
                value: `${invitedAt.date} · ${invitedAt.time}`,
              },
            ]}
          />
        </SectionCard>
        <SectionCard title="Identity">
          <DescriptionList
            items={[
              { label: 'Display name', value: record.displayName },
              { label: 'Username', value: record.username },
              { label: 'Email', value: record.email },
              {
                label: 'Account status',
                value: (
                  <StatusChip
                    value={record.userStatus}
                    label={userStatusLabel(record.userStatus)}
                  />
                ),
              },
              { label: 'User ID', value: <CopyIdButton value={record.id} label="User ID" /> },
            ]}
          />
        </SectionCard>
        <RequestedAccess
          userName={record.displayName}
          membership={membership}
          roles={roles}
          scan={scan}
          roleIndex={roleIndex}
          branchIndex={branchIndex}
          selectedBranch={selectedBranch}
          canSwitch={
            resolved.profile.branches.filter((entry) => entry.status === 'ACTIVE').length > 1
          }
        />
        {(state === 'awaiting' || state === 'blocked') && (
          <SectionCard title="Control checks" description={CHECKS_DESCRIPTION}>
            <ControlChecks
              checks={userControlChecks({
                maker: record.createdBy,
                me,
                switchState,
                roles:
                  roles === null
                    ? null
                    : roles.ok
                      ? { ok: true, value: roles.value.items.length }
                      : roles,
                // A capped scan, or one a selected branch narrowed, can't prove "none" (rule 9).
                branches:
                  scan === null
                    ? null
                    : scan.ok
                      ? {
                          ok: true,
                          value: {
                            count: scan.value.items.length,
                            complete: !scan.value.truncated && selectedBranch === null,
                          },
                        }
                      : scan,
                membershipType: membership?.ok ? (membership.value?.type ?? null) : null,
                organisationName: resolved.context.organization.name,
              })}
            />
          </SectionCard>
        )}
      </Box>
    </>
  );
}
