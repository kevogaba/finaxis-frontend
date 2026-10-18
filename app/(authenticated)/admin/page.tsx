import type { Metadata } from 'next';
import { Suspense, type ReactNode } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import { getCurrentContextProfile } from '@/auth/context-service';
import { PageHeader } from '@/components/shell/page-header';
import { administrationModule } from '@/modules/administration/administration-module';
import { BusinessDateSection } from '@/modules/administration/overview/components/business-date-card';
import { OverviewCardSkeleton } from '@/modules/administration/overview/components/overview-card-skeleton';
import { PendingApprovalsSection } from '@/modules/administration/overview/components/pending-approvals-card';
import { ReadinessSection } from '@/modules/administration/overview/components/readiness-card';
import { RecentActivitySection } from '@/modules/administration/overview/components/recent-activity-card';
import {
  CARD_TITLES,
  NO_OVERVIEW_CARDS,
  noOverviewCards,
  OVERVIEW_DESCRIPTION,
  OVERVIEW_TITLE,
  overviewCards,
} from '@/modules/administration/overview/overview-rules';

export const metadata: Metadata = { title: 'Overview' };

/** A card behind its own Suspense boundary and skeleton (spec §6.3): a slow or failed read never
 * holds up the heading or another card. */
function card(title: string, content: ReactNode) {
  return <Suspense fallback={<OverviewCardSkeleton title={title} />}>{content}</Suspense>;
}

/**
 * Tenant overview (spec §10.8): Business date, Pending approvals, Operational readiness and Recent
 * activity, each from live reads. Which cards show is decided from the profile before any read
 * (Ruling 2); each card reads, settles and fails on its own. When none applies, one note says so.
 */
export default async function AdminOverviewPage() {
  const selected = await getCurrentContextProfile();
  const header = (
    <PageHeader
      eyebrow={administrationModule.name}
      title={OVERVIEW_TITLE}
      description={OVERVIEW_DESCRIPTION}
    />
  );
  // The authenticated layout sends an unresolved context to context selection. Layouts and pages
  // render in parallel, so `admin/layout.tsx`'s redirect of the platform context doesn't stop this
  // page: like the bell, it reads nothing outside the administration workspace. A tenant context
  // always carries its organisation; without one there is nothing to read.
  if (
    selected.kind !== 'resolved' ||
    selected.context.module.id !== administrationModule.id ||
    !selected.profile.organisation
  ) {
    return header;
  }
  const { permissions, organisation } = selected.profile;
  const cards = overviewCards({ permissions });
  if (noOverviewCards(cards)) {
    return (
      <>
        {header}
        <Alert severity="info" role="note">
          {NO_OVERVIEW_CARDS}
        </Alert>
      </>
    );
  }
  return (
    <>
      {header}
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) minmax(0, 2fr)' },
        }}
      >
        {cards.businessDate && card(CARD_TITLES.businessDate, <BusinessDateSection />)}
        {cards.approvals &&
          card(
            CARD_TITLES.approvals,
            <PendingApprovalsSection
              users={cards.approvals.users}
              branches={cards.approvals.branches}
              branchSelected={selected.context.branch !== null}
            />,
          )}
        {cards.readiness &&
          card(
            CARD_TITLES.readiness,
            <ReadinessSection permissions={permissions} organisationStatus={organisation.status} />,
          )}
        {cards.activity &&
          card(
            CARD_TITLES.activity,
            <RecentActivitySection
              names={cards.activity.names}
              timeZone={cards.activity.timeZone}
            />,
          )}
      </Box>
    </>
  );
}
