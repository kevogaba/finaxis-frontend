import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Users' };

export default function AdminUsersPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Users"
        description="Invite, deactivate, and manage member-facing and staff accounts."
      />
      <PlaceholderSection
        label="User management"
        emptyStateMessage="User management will let you invite staff, assign roles, and review account status once it's connected to the identity and provisioning services."
      />
    </>
  );
}
