import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Roles & Permissions' };

export default function AdminRolesPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Roles & Permissions"
        description="Define application roles and the permissions attached to them."
      />
      <PlaceholderSection
        label="Roles & permissions"
        emptyStateMessage="Role and permission management will appear here once an authorization policy engine is connected. Roles shown elsewhere in the app today are informational only."
      />
    </>
  );
}
