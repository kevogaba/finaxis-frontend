import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Settings' };

export default function AdminSettingsPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Settings"
        description="Organization-wide configuration for the Finaxis workspace."
      />
      <PlaceholderSection
        label="Organization settings"
        emptyStateMessage="Organization-wide settings will appear here once configuration management is connected."
      />
    </>
  );
}
