import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Branches' };

export default function AdminBranchesPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Branches"
        description="Manage branch locations and their operating configuration."
      />
      <PlaceholderSection
        label="Branch management"
        emptyStateMessage="Branch management will let you create, edit, and assign staff to branches once branch resolution is connected."
      />
    </>
  );
}
