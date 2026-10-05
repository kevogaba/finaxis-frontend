import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAll } from '@/auth/permissions';
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
import {
  getBranchIndex,
  getOrganisationTimeZone,
  getRoleIndex,
  getTenantUser,
} from '@/lib/api/lookups';
import { formatInstant } from '@/lib/format';
import {
  userControlChecks,
  type CheckRead,
  type MakerFact,
} from '@/modules/administration/approvals/approval-checks';
import {
  CHECKS_DESCRIPTION,
  MAKER_NOT_PERMITTED,
  MAKER_NOT_RECORDED,
  READ_FAILED,
  REQUEST_DESCRIPTION,
  USER_APPROVAL_EYEBROW,
  USER_APPROVAL_FORBIDDEN,
  USER_REQUEST,
} from '@/modules/administration/approvals/approval-copy';
import {
  availableUserDecisions,
  blockedUserDecisions,
  isSameUser,
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
  userApprovalState,
  userOutcomeNote,
} from '@/modules/administration/approvals/approval-rules';
import {
  getMakerEvent,
  listRequestedRoles,
} from '@/modules/administration/approvals/approval-service';
import { ControlChecks } from '@/modules/administration/approvals/components/control-checks';
import { DecisionBar } from '@/modules/administration/approvals/components/decision-bar';
import { MakerValue } from '@/modules/administration/approvals/components/request-facts';
import { RequestedAccess } from '@/modules/administration/approvals/components/requested-access';
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
  const holder = { permissions: resolved?.profile.permissions ?? [] };
  const failure = (content: ReactNode) => (
    <>
      <PageHeader eyebrow={USER_APPROVAL_EYEBROW} title="User approval" />
      <Paper>{content}</Paper>
    </>
  );
  if (!resolved || !canAll(holder, USER_APPROVAL_CODES)) {
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
  // Each read only with its own code; load() redirects on a lost session or a stale context, and
  // any other failure is shown where its fact would be (rule 9).
  const [membership, maker, roles, scan, roleIndex, branchIndex, timeZone] = await Promise.all([
    can(holder, 'membership.view') ? load(findUserMembership(record.id, record.email)) : null,
    can(holder, 'audit.view') ? load(getMakerEvent('user', record.id)) : null,
    can(holder, 'role_assignment.view') ? load(listRequestedRoles(record.id)) : null,
    can(holder, 'branch_assignment.view') ? load(listUserBranchAssignments(record.id)) : null,
    getRoleIndex(), // empty without role.view: names fall back to short ids
    getBranchIndex(), // empty without branch.view: names fall back to short ids
    getOrganisationTimeZone(),
  ]);
  const actor = maker?.ok ? (maker.value?.actorUserId ?? null) : null;
  // One cached lookup; an unreadable user falls back to the short id.
  const makerName = actor ? ((await getTenantUser(actor))?.displayName ?? null) : null;

  const membershipId = membership?.ok ? (membership.value?.id ?? null) : null;
  const decisions = membershipId ? availableUserDecisions(state, holder) : [];
  const blocked = blockedUserDecisions(decisions, {
    state,
    userStatus: record.userStatus,
    invitedByMe: isSameUser(actor, me),
  });
  const outcome = userOutcomeNote(state, record.membershipStatus);
  const note = outcome === null ? membershipActionsNote(holder, lookupOutcome(membership)) : null;
  const onboarding = onboardingState(record.membershipStatus, record.userStatus);
  const invitedAt =
    maker?.ok && maker.value ? formatInstant(maker.value.occurredAt, timeZone) : null;
  const makerFact: CheckRead<MakerFact | null> =
    maker === null
      ? null
      : maker.ok
        ? { ok: true, value: maker.value ? { actorUserId: actor, name: makerName } : null }
        : maker;

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
              contextOrganisationId={resolved.context.organization.id}
            />
          ) : undefined
        }
      />
      <Box sx={{ display: 'grid', gap: 3, mt: 4 }}>
        {outcome && (
          <Alert severity="info" role="note">
            {outcome}{' '}
            <Link component={NextLink} href={`/admin/users/${record.id}`}>
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
              { label: 'Invited by', value: <MakerValue maker={maker} name={makerName} me={me} /> },
              {
                label: `Invited (${timeZone})`,
                // The maker read's own state, never a dash for a read that failed or wasn't made
                // (rule 9). The reference stays once, on "Invited by".
                value:
                  maker === null
                    ? MAKER_NOT_PERMITTED
                    : !maker.ok
                      ? READ_FAILED
                      : invitedAt
                        ? `${invitedAt.date} · ${invitedAt.time}`
                        : MAKER_NOT_RECORDED,
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
                maker: makerFact,
                me,
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
