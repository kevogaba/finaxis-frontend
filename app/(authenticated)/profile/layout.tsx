import type { ReactNode } from 'react';
import { RecordHero } from '@/components/data-display/record-hero';
import { RecordTabs, type RecordTab } from '@/components/data-display/record-tabs';
import { StatusChip } from '@/components/data-display/status-chip';
import { canViewActivity, workspaceHome } from '@/modules/profile/profile-rules';
import { requireProfile } from '@/modules/profile/profile-service';

/**
 * Spec §10.9: the account profile as a record page — the hero here, each tab a nested route that
 * validates the session again (`requireProfile` is request-cached, so this costs nothing extra).
 */
export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const { user, context } = await requireProfile();
  const tabs: RecordTab[] = [
    { href: '/profile', label: 'Overview' },
    { href: '/profile/contexts', label: 'Contexts' },
    { href: '/profile/roles', label: 'Roles & permissions' },
    { href: '/profile/security', label: 'Security' },
    ...(canViewActivity(user, context.module.id)
      ? [{ href: '/profile/activity', label: 'Activity' }]
      : []),
  ];

  return (
    <>
      <RecordHero
        back={{ href: workspaceHome(context.module.id), label: `Back to ${context.module.name}` }}
        avatar={{ kind: 'person', name: user.name }}
        eyebrow={`${context.module.name} · Account profile`}
        title="My profile"
        subtitle={[user.name, user.email].filter(Boolean).join(' · ')}
        status={<StatusChip value={user.membershipStatus} />}
      />
      <RecordTabs label="Profile sections" tabs={tabs} />
      {children}
    </>
  );
}
