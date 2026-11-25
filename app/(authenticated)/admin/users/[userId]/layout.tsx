import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import Paper from '@mui/material/Paper';
import { getCurrentContextProfile } from '@/auth/context-service';
import { can, canAnywhere, permissionHolder } from '@/auth/permissions';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs } from '@/components/data-display/record-tabs';
import { humanizeEnum, StatusChip } from '@/components/data-display/status-chip';
import { PageHeader } from '@/components/shell/page-header';
import { load } from '@/lib/api/load';
import {
  isMaker,
  makerGate,
  SELF_APPROVAL_NOTE_USERS,
} from '@/modules/administration/approvals/maker-checker';
import { readMakerCheckerSwitch } from '@/modules/administration/settings/settings-service';
import { UserLifecycleActions } from '@/modules/administration/users/components/user-lifecycle-actions';
import {
  availableMembershipActions,
  blockedMembershipActions,
  membershipActionsNote,
  onboardingState,
  parseUserId,
} from '@/modules/administration/users/user-rules';
import { getUser } from '@/modules/administration/users/user-service';

export const metadata: Metadata = { title: 'User record' };

interface UserRecordLayoutProps {
  children: ReactNode;
  params: Promise<{ userId: string }>;
}

/** Record shell (spec §9): the user is read once here; each tab fetches its own data. Users are
 * never branch-restricted (contract §E.4). */
export default async function UserRecordLayout({ children, params }: UserRecordLayoutProps) {
  // Rule 7: the id is checked, and canonicalised, before any read.
  const userId = parseUserId((await params).userId);
  if (!userId) notFound();

  const [user, selected] = await Promise.all([load(getUser(userId)), getCurrentContextProfile()]);
  const resolved = selected.kind === 'resolved' ? selected : null;
  if (!user.ok) {
    if (user.problem.code === 'resource_not_found') notFound();
    return (
      <>
        <PageHeader eyebrow="Administration · User record" title="User record" />
        <Paper>
          {user.problem.code === 'forbidden' ? (
            <ForbiddenState />
          ) : (
            <ErrorState problem={user.problem} />
          )}
        </Paper>
      </>
    );
  }

  const record = user.value;
  const holder = permissionHolder(resolved?.profile);
  const status = { membershipStatus: record.membershipStatus, userStatus: record.userStatus };
  // The user read carries the membership's id (BG-09): no lookup, so nothing to wait on or fail.
  const actions = availableMembershipActions(status, holder);
  // BG-08: the inviter is the record's own `created_by`; the switch is read only when they are
  // the one who could approve (decision Q4: unread, Approve stays on offer for the platform).
  const me = resolved?.profile.user_id ?? '';
  const makers = [record.createdBy?.id];
  const gate = makerGate({
    makerIds: makers,
    callerId: me,
    switchState:
      actions.includes('approve') && isMaker(makers, me)
        ? await readMakerCheckerSwitch('user_invites', holder)
        : 'unknown',
  });
  const blocked = blockedMembershipActions(actions, {
    ...status,
    self: record.id === resolved?.profile.user_id, // the backend's id, not the URL's (Ruling 6)
    makerGate: gate,
  });
  const warning =
    actions.includes('approve') && !blocked.approve && gate === 'allowed-self-approval'
      ? SELF_APPROVAL_NOTE_USERS
      : null;
  const note = membershipActionsNote(holder);
  const onboarding = onboardingState(record.membershipStatus, record.userStatus);
  const base = `/admin/users/${userId}`;

  return (
    <>
      <RecordHero
        back={{ href: '/admin/users', label: 'Back to users' }}
        avatar={{ kind: 'person', name: record.displayName }}
        eyebrow="Administration · User record"
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
          // Undefined, not an empty component: RecordHero renders its actions box whenever this is
          // truthy (08's layout).
          actions.length > 0 || note ? (
            <UserLifecycleActions
              membershipId={record.membershipId}
              userName={record.displayName}
              actions={actions}
              blocked={blocked}
              note={note}
              warning={warning}
              userStatus={record.userStatus}
              contextOrganisationId={resolved?.context.organization.id}
            />
          ) : undefined
        }
      />
      <RecordTabs
        label={`${record.displayName} sections`}
        tabs={[
          { href: base, label: 'Overview' },
          ...(can(holder, 'role_assignment.view')
            ? [{ href: `${base}/access`, label: 'Roles & access' }]
            : []),
          // The search by user answers with every branch a grant covers, at All branches too (BG-03).
          ...(canAnywhere(holder, 'branch_assignment.view')
            ? [{ href: `${base}/branches`, label: 'Branch assignments' }]
            : []),
          ...(can(holder, 'audit.view') ? [{ href: `${base}/audit`, label: 'Audit' }] : []),
        ]}
      />
      {children}
    </>
  );
}
