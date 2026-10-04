import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { PermissionHolder } from '@/auth/permissions';
import { CopyIdButton } from '@/components/data-display/copy-id-button';
import { DescriptionList, type DescriptionItem } from '@/components/data-display/description-list';
import { RecordHero } from '@/components/data-display/record-hero';
import { SectionCard } from '@/components/data-display/section-card';
import { StatusChip } from '@/components/data-display/status-chip';
import type { UserSummary } from '@/modules/administration/users/user-contract';
import { onboardingState, userStatusLabel } from '@/modules/administration/users/user-rules';
import {
  accountActionsNote,
  accountChipLabel,
  accountScopeNote,
  availableAccountActions,
  blockedAccountActions,
  membershipChipLabel,
  type AccountScope,
} from '../account-rules';
import { AccountLifecycleActions } from './account-lifecycle-actions';

interface AccountRecordProps {
  user: UserSummary;
  scope: AccountScope;
  back: { href: string; label: string };
  eyebrow: string;
  /** "Membership in Acme SACCO", or the platform organisation's. */
  membershipLabel: string;
  holder: PermissionHolder;
  /** `profile.user_id`; null when the context couldn't be resolved. */
  signedInUserId: string | null;
  contextOrganisationId?: string;
}

/** A person's record in the platform workspace (spec §11.2, §11.3): the global account lifecycle in
 * the hero (Rulings 5–7); the membership is the one the route read it through. */
export function AccountRecord({
  user,
  scope,
  back,
  eyebrow,
  membershipLabel,
  holder,
  signedInUserId,
  contextOrganisationId,
}: AccountRecordProps) {
  const actions = availableAccountActions(user.userStatus, holder);
  // The backend's ids on both sides, compared in one case (Ruling 6).
  const self = signedInUserId !== null && user.id.toLowerCase() === signedInUserId.toLowerCase();
  const blocked = blockedAccountActions(actions, { self });
  const note = accountActionsNote(user.userStatus, holder);
  const onboarding = onboardingState(user.membershipStatus, user.userStatus);
  const items: DescriptionItem[] = [
    { label: 'Display name', value: user.displayName },
    { label: 'Username', value: user.username },
    { label: 'Email', value: user.email },
    {
      label: 'Account',
      value: <StatusChip value={user.userStatus} label={userStatusLabel(user.userStatus)} />,
    },
    { label: membershipLabel, value: <StatusChip value={user.membershipStatus} /> },
    {
      label: 'Onboarding',
      value: <StatusChip value={onboarding.key} label={onboarding.label} tone={onboarding.tone} />,
    },
    { label: 'User ID', value: <CopyIdButton value={user.id} label="User ID" /> },
  ];

  return (
    <>
      <RecordHero
        back={back}
        avatar={{ kind: 'person', name: user.displayName }}
        eyebrow={eyebrow}
        title={user.displayName}
        subtitle={`${user.username} · ${user.email}`}
        status={
          <>
            <StatusChip value={user.userStatus} label={accountChipLabel(user.userStatus)} />
            <StatusChip
              value={user.membershipStatus}
              label={membershipChipLabel(user.membershipStatus)}
            />
          </>
        }
        actions={
          // Undefined, not an empty component: RecordHero renders its actions box whenever truthy.
          actions.length > 0 || note ? (
            <AccountLifecycleActions
              userId={user.id}
              userName={user.displayName}
              username={user.username}
              actions={actions}
              blocked={blocked}
              note={note}
              contextOrganisationId={contextOrganisationId}
            />
          ) : undefined
        }
      />
      <Box sx={{ mt: 4 }}>
        <SectionCard title="Account and membership">
          <Alert severity="info" role="note" sx={{ mx: 4.5, mt: 3.5 }}>
            {accountScopeNote(scope)}
          </Alert>
          <DescriptionList items={items} />
        </SectionCard>
      </Box>
    </>
  );
}
