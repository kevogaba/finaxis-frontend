import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getCurrentContextProfile } from '@/auth/context-service';
import { canAll } from '@/auth/permissions';
import { EmptyState } from '@/components/data-display/empty-state';
import { ErrorState } from '@/components/data-display/error-state';
import { ForbiddenState } from '@/components/data-display/forbidden-state';
import { SectionCard } from '@/components/data-display/section-card';
import { TablePaginationBar } from '@/components/data-display/table-pagination-bar';
import { load } from '@/lib/api/load';
import { lastPageIfPastEnd, parsePaging } from '@/lib/api/paging';
import { hrefWith, toSearchParams } from '@/lib/api/query-string';
import {
  NO_USERS_WAITING,
  USER_APPROVAL_FORBIDDEN,
  USER_QUEUE_DESCRIPTION,
} from '@/modules/administration/approvals/approval-copy';
import {
  USER_APPROVAL_CODES,
  USER_QUEUE_HREF,
  USER_QUEUE_LABEL,
} from '@/modules/administration/approvals/approval-rules';
import { listUserApprovals } from '@/modules/administration/approvals/approval-service';
import { UserDirectoryTable } from '@/modules/administration/users/components/user-directory-table';
import { DEFAULT_USER_PAGE_SIZE } from '@/modules/administration/users/user-query';

export const metadata: Metadata = { title: 'User onboarding' };

interface UserOnboardingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The User onboarding tab (spec §10.6): memberships PENDING_APPROVAL, newest first, paged in the
 * URL. A row whose user is provisioning reads "Provisioning identity" and opens a page with no
 * decision (Ruling 12). */
export default async function UserOnboardingPage({ searchParams }: UserOnboardingPageProps) {
  const params = toSearchParams(await searchParams);
  const selected = await getCurrentContextProfile();
  const holder = { permissions: selected.kind === 'resolved' ? selected.profile.permissions : [] };
  const card = (content: ReactNode) => (
    <SectionCard title={USER_QUEUE_LABEL} description={USER_QUEUE_DESCRIPTION}>
      {content}
    </SectionCard>
  );
  // A typed URL without the codes: the tab isn't offered, and nothing is read.
  if (!canAll(holder, USER_APPROVAL_CODES)) {
    return card(<ForbiddenState description={USER_APPROVAL_FORBIDDEN} />);
  }

  const users = await load(listUserApprovals(parsePaging(params, DEFAULT_USER_PAGE_SIZE)));
  if (!users.ok) {
    return card(
      users.problem.code === 'forbidden' ? (
        <ForbiddenState />
      ) : (
        <ErrorState problem={users.problem} />
      ),
    );
  }
  const redirectPage = lastPageIfPastEnd(users.value.page);
  if (redirectPage !== null) {
    redirect(
      hrefWith(USER_QUEUE_HREF, params, { page: redirectPage === 0 ? null : String(redirectPage) }),
    );
  }

  return card(
    <>
      {users.value.items.length === 0 ? (
        <EmptyState title={NO_USERS_WAITING} />
      ) : (
        <UserDirectoryTable users={users.value.items} basePath={USER_QUEUE_HREF} />
      )}
      <TablePaginationBar page={users.value.page} />
    </>,
  );
}
