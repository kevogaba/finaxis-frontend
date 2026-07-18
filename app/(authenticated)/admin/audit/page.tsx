import type { Metadata } from 'next';
import { SectionHeading } from '@/components/shell/section-heading';
import { PlaceholderSection } from '@/components/shell/placeholder-section';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Audit Logs' };

export default function AdminAuditPage() {
  return (
    <>
      <SectionHeading
        parentLabel={administrationModule.name}
        parentHref="/admin"
        label="Audit Logs"
        description="Review security-relevant events across your organization."
      />
      <PlaceholderSection
        label="Audit logs"
        emptyStateMessage="Audit log review will appear here once event delivery is connected."
      />
    </>
  );
}
