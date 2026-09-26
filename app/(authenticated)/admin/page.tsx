import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/page-header';
import { administrationModule } from '@/modules/administration/administration-module';

export const metadata: Metadata = { title: 'Overview' };

/**
 * Tenant overview. Its operational sections (pending approvals, readiness, recent activity)
 * arrive in PR 14 once their data slices exist; nothing is shown that isn't live.
 */
export default function AdminOverviewPage() {
  return (
    <PageHeader
      eyebrow={administrationModule.name}
      title="Administration Overview"
      description="Manage your institution's operational setup, users, and controls."
    />
  );
}
